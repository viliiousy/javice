package app.bashy.hub;

// 항상 듣고 있다가 호출어("자비스")를 들으면 깨어나는 귀.
//
// 안드로이드의 음성 인식기를 계속 다시 켜는 방식이다. 한 번 듣고 끝나면 곧바로 다시 듣는다.
//   대기(WAKE)   : 들린 말에 호출어가 있는지만 본다. 없으면 버리고 다시 듣는다.
//   명령(COMMAND): 호출어를 들은 뒤 한 문장을 받아 'command' 로 넘긴다.
// "자비스 거실 불 꺼 줘" 처럼 한숨에 말하면 호출어 뒤의 말을 바로 명령으로 쓴다.
//
// 인식기를 켤 때마다 기기에 따라 '삑' 소리가 나서, 켜는 순간에만 소리를 잠깐 죽였다가 되살린다.
// 가능하면 기기 안(온디바이스) 인식기를 써서 인터넷과 배터리를 덜 쓴다.
//
// JS 쪽 이벤트: wake, command {text}, state {mode}, error {code, message}
//
// 오래 켜 두면 안드로이드 인식기가 결과도 오류도 없이 멈춰 버리는 일이 있다(몇 분 뒤 '아무리 불러도 안 됨').
// 그래서 4초마다 살펴보는 감시자를 둔다.
//   - 한 번 듣기가 25초 넘게 끝나지 않으면 인식기를 버리고 새로 만든다.
//   - 듣고 있지도, 다시 들을 예정도 없는 채로 5초가 지나면 다시 듣기 시작한다.
//   - 말하는 동안 멈춘(pause) 상태가 60초 넘게 이어지면 풀어 준다(되살리기 신호를 놓친 경우).
//   - 10분마다 인식기를 새로 만든다(오래 쓴 인식기가 굳는 것을 미리 막는다).

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@CapacitorPlugin(
    name = "JarvisListener",
    permissions = { @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone") }
)
public class JarvisListener extends Plugin {

    private static final int WAKE = 0, COMMAND = 1;
    private static final int[] QUIET_STREAMS = { AudioManager.STREAM_MUSIC, AudioManager.STREAM_NOTIFICATION, AudioManager.STREAM_SYSTEM };

    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable listenTask = this::listen;
    private SpeechRecognizer rec;
    private boolean onDevice = false, triedOnDevice = false;
    private boolean enabled = false, paused = false, appVisible = true, running = false, muted = false;
    private int mode = WAKE;
    private boolean wokeThisSession = false;
    private String lang = "ko-KR";
    private final List<String> wakeWords = new ArrayList<>();
    private long startedAt = 0, idleSince = 0, pausedAt = 0, recBornAt = 0;
    private int errorsInRow = 0;
    private final Runnable watch = this::watchdog;

    // ── JS 에서 부르는 것 ─────────────────────────
    @PluginMethod
    public void start(PluginCall call) {
        lang = call.getString("lang", "ko-KR");
        wakeWords.clear();
        JSArray arr = call.getArray("wakeWords");
        try {
            if (arr != null) for (Object o : arr.toList()) wakeWords.add(norm(String.valueOf(o)));
        } catch (Exception ignored) {}
        if (wakeWords.isEmpty()) wakeWords.add(norm("자비스"));

        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "afterPermission");
            return;
        }
        begin(call);
    }

    @PermissionCallback
    private void afterPermission(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) begin(call);
        else call.reject("마이크 권한이 필요합니다");
    }

    private void begin(PluginCall call) {
        enabled = true; paused = false; mode = WAKE;
        main.post(listenTask);
        main.removeCallbacks(watch); main.postDelayed(watch, 4000);
        JSObject r = new JSObject();
        r.put("available", SpeechRecognizer.isRecognitionAvailable(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        enabled = false;
        main.removeCallbacks(watch);
        main.post(this::halt);
        call.resolve();
    }

    // 말하는 동안(TTS) 자기 목소리를 듣지 않도록 잠깐 멈춘다
    @PluginMethod
    public void pause(PluginCall call) {
        paused = true; pausedAt = System.currentTimeMillis();
        main.post(this::halt);
        call.resolve();
    }

    @PluginMethod
    public void resume(PluginCall call) {
        paused = false; mode = WAKE;
        main.postDelayed(listenTask, 250);
        call.resolve();
    }

    // 화면에서 마이크 단추를 눌렀을 때 — 호출어 없이 바로 명령을 듣는다
    @PluginMethod
    public void listenNow(PluginCall call) {
        paused = false;
        main.post(() -> { halt(); mode = COMMAND; listen(); });
        call.resolve();
    }

    @Override
    protected void handleOnPause() { appVisible = false; main.post(this::halt); }

    @Override
    protected void handleOnResume() { appVisible = true; if (enabled && !paused) { mode = WAKE; main.postDelayed(listenTask, 400); } }

    // JS 가 상태를 확인할 때 (화면 쪽 감시용)
    @PluginMethod
    public void status(PluginCall call) {
        JSObject o = new JSObject();
        o.put("enabled", enabled); o.put("paused", paused); o.put("running", running);
        o.put("mode", mode == WAKE ? "wake" : "command");
        o.put("sinceStart", startedAt == 0 ? -1 : System.currentTimeMillis() - startedAt);
        call.resolve(o);
    }

    // ── 감시자 ───────────────────────────────────
    private void watchdog() {
        if (!enabled) return;
        long now = System.currentTimeMillis();
        try {
            if (paused && pausedAt > 0 && now - pausedAt > 60000) { paused = false; mode = WAKE; again(100); }
            if (!paused && appVisible) {
                if (running && now - startedAt > 25000) { recycle(); again(300); }
                else if (!running && idleSince > 0 && now - idleSince > 5000) { idleSince = now; again(50); }
                else if (!running && recBornAt > 0 && now - recBornAt > 10 * 60000) { recycle(); }
            }
        } catch (Exception ignored) {}
        main.postDelayed(watch, 4000);
    }

    // 인식기를 버리고 다음 듣기 때 새로 만든다
    private void recycle() {
        main.removeCallbacks(listenTask);
        running = false;
        if (rec != null) { try { rec.cancel(); } catch (Exception ignored) {} try { rec.destroy(); } catch (Exception ignored) {} rec = null; }
        quiet(false);
    }

    @Override
    protected void handleOnDestroy() { main.post(() -> { halt(); if (rec != null) { rec.destroy(); rec = null; } }); }

    // ── 인식기 ────────────────────────────────────
    private void ensureRecognizer() {
        if (rec != null) return;
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= 31 && !triedOnDevice && SpeechRecognizer.isOnDeviceRecognitionAvailable(ctx)) {
            try { rec = SpeechRecognizer.createOnDeviceSpeechRecognizer(ctx); onDevice = true; }
            catch (Exception e) { rec = null; onDevice = false; }
        }
        if (rec == null) { rec = SpeechRecognizer.createSpeechRecognizer(ctx); onDevice = false; }
        rec.setRecognitionListener(new Ear());
        recBornAt = System.currentTimeMillis();
    }

    private void listen() {
        if (!enabled || paused || !appVisible || running) return;
        try {
            ensureRecognizer();
            Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
            i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
            i.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getContext().getPackageName());
            if (!onDevice) i.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
            if (mode == COMMAND) {
                i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1200L);
                i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1000L);
            }
            wokeThisSession = false;
            quiet(true);
            running = true; startedAt = System.currentTimeMillis(); idleSince = 0;
            rec.startListening(i);
            state();
        } catch (Exception e) {
            running = false; quiet(false);
            recycle();
            again(1500);
        }
    }

    private void halt() {
        main.removeCallbacks(listenTask);
        running = false;
        if (rec != null) { try { rec.cancel(); } catch (Exception ignored) {} }
        quiet(false);
    }

    private void again(long ms) {
        idleSince = System.currentTimeMillis();
        main.removeCallbacks(listenTask);
        if (enabled && !paused && appVisible) main.postDelayed(listenTask, ms);
    }

    // 인식기를 켤 때 나는 '삑' 소리만 죽인다. 듣기 시작하면 곧바로 되살린다.
    private void quiet(boolean on) {
        if (on == muted) return;
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        for (int s : QUIET_STREAMS) {
            try { am.adjustStreamVolume(s, on ? AudioManager.ADJUST_MUTE : AudioManager.ADJUST_UNMUTE, 0); }
            catch (Exception ignored) {}   // 방해 금지 모드 등에서는 막힐 수 있다 — 그냥 넘어간다
        }
        muted = on;
    }

    private void state() {
        JSObject o = new JSObject();
        o.put("mode", mode == WAKE ? "wake" : "command");
        o.put("onDevice", onDevice);
        notifyListeners("state", o);
    }

    // ── 호출어 찾기 ───────────────────────────────
    private static String norm(String s) {
        return s == null ? "" : s.toLowerCase(Locale.ROOT).replaceAll("[\\s\\p{Punct}]", "");
    }

    // 호출어를 찾으면 그 뒤에 이어진 말(원문 그대로)을, 못 찾으면 null
    private String afterWake(String raw) {
        if (raw == null) return null;
        String n = norm(raw);
        for (String w : wakeWords) {
            int at = n.indexOf(w);
            if (at < 0) continue;
            // 정규화한 글자 수를 원문 위치로 되돌린다
            int need = at + w.length(), seen = 0, cut = raw.length();
            for (int k = 0; k < raw.length(); k++) {
                char c = raw.charAt(k);
                if (!Character.isWhitespace(c) && !String.valueOf(c).matches("\\p{Punct}")) seen++;
                if (seen == need) { cut = k + 1; break; }
            }
            String rest = raw.substring(Math.min(cut, raw.length())).trim();
            rest = rest.replaceFirst("^(야|아|님|씨)\\s*", "").replaceFirst("^[,.!?\\s]+", "").trim();
            return rest;
        }
        return null;
    }

    private String findWake(ArrayList<String> list) {
        if (list == null) return null;
        for (String s : list) { String r = afterWake(s); if (r != null) return r; }
        return null;
    }

    private void emitWake() {
        if (wokeThisSession) return;
        wokeThisSession = true;
        notifyListeners("wake", new JSObject());
    }

    private void emitCommand(String text) {
        JSObject o = new JSObject();
        o.put("text", text == null ? "" : text);
        notifyListeners("command", o);
    }

    private class Ear implements RecognitionListener {
        @Override public void onReadyForSpeech(Bundle b) { main.postDelayed(() -> quiet(false), 450); }
        @Override public void onBeginningOfSpeech() {}
        @Override public void onRmsChanged(float v) {}
        @Override public void onBufferReceived(byte[] b) {}
        @Override public void onEndOfSpeech() {}
        @Override public void onEvent(int t, Bundle b) {}

        @Override
        public void onPartialResults(Bundle b) {
            if (mode != WAKE) return;
            ArrayList<String> list = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            if (findWake(list) != null) emitWake();   // 띠링은 빨리 — 말이 끝나기 전에
        }

        @Override
        public void onResults(Bundle b) {
            running = false; quiet(false); errorsInRow = 0;
            ArrayList<String> list = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            if (mode == COMMAND) {
                mode = WAKE;
                emitCommand(list != null && !list.isEmpty() ? list.get(0) : "");
                again(300);
                return;
            }
            String rest = findWake(list);
            if (rest == null) { again(150); return; }
            emitWake();
            if (rest.length() >= 2) { emitCommand(rest); again(300); }
            else { mode = COMMAND; again(150); }
        }

        @Override
        public void onError(int code) {
            running = false; quiet(false);
            // 온디바이스 인식기가 한국어를 아직 못 하면 일반 인식기로 바꾼다
            if (onDevice && (code == 12 || code == 13)) {   // LANGUAGE_NOT_SUPPORTED / LANGUAGE_UNAVAILABLE
                triedOnDevice = true;
                if (rec != null) { rec.destroy(); rec = null; }
                again(200); return;
            }
            if (code == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                enabled = false;
                JSObject o = new JSObject(); o.put("code", code); o.put("message", "마이크 권한이 없습니다");
                notifyListeners("error", o); return;
            }
            if (mode == COMMAND && (code == SpeechRecognizer.ERROR_NO_MATCH || code == SpeechRecognizer.ERROR_SPEECH_TIMEOUT)) {
                mode = WAKE; emitCommand(""); again(300); return;
            }
            long wait = 150;
            errorsInRow++;
            // 같은 오류가 거듭되면 인식기가 굳은 것이다 — 새로 만든다. 온디바이스가 계속 말썽이면 일반 인식기로.
            if (errorsInRow >= 6) { if (onDevice) triedOnDevice = true; recycle(); errorsInRow = 0; again(1000); return; }
            if (code == SpeechRecognizer.ERROR_RECOGNIZER_BUSY || code == 10 || code == 11) { wait = 800; recycle(); }   // BUSY / TOO_MANY_REQUESTS / SERVER_DISCONNECTED
            else if (code == SpeechRecognizer.ERROR_NETWORK || code == SpeechRecognizer.ERROR_NETWORK_TIMEOUT || code == SpeechRecognizer.ERROR_SERVER) wait = 3000;
            else if (code == SpeechRecognizer.ERROR_CLIENT) { wait = 500; recycle(); }
            again(wait);
        }
    }
}
