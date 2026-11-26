package es.thor.showdown;

import android.app.Activity;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;

/**
 * Lee el mando de la Thor desde Android y se lo da a la página
 * (el puente puente.js lo convierte en navigator.getGamepads()).
 *
 * Números de botón = "mapping standard", los mismos que medimos en Firefox:
 * A=0, B=1, X=2, Y=3, L1=4, R1=5, L2=6, R2=7, Select=8, Start=9,
 * L3=10, R3=11, cruceta arriba=12, abajo=13, izquierda=14, derecha=15.
 */
final class GamepadBridge {

    static final int N_BUTTONS = 17;
    static final int BTN_A = 0;
    static final int BTN_B = 1;

    private final Activity activity;

    /** Botón pulsado ahora (por tecla). */
    private final boolean[] keyDown = new boolean[N_BUTTONS];
    /** Valor por eje analógico (gatillos, cruceta como "hat"). */
    private final float[] axisValue = new float[N_BUTTONS];
    /** Pulsado desde la última lectura: así no se pierde un toque muy rápido. */
    private final boolean[] latched = new boolean[N_BUTTONS];
    /** Sticks: 0-1 izquierdo (x, y), 2-3 derecho (x, y). */
    private final float[] axes = new float[4];

    private boolean connected;

    GamepadBridge(Activity activity) {
        this.activity = activity;
        this.connected = anyGamepadPresent();
    }

    /* ------------------------------------------------------------------ */
    /*  Teclas                                                             */
    /* ------------------------------------------------------------------ */

    /** Botón del mando que corresponde a esta tecla de Android, o -1. */
    static int buttonFor(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_BUTTON_A: return 0;
            case KeyEvent.KEYCODE_BUTTON_B: return 1;
            case KeyEvent.KEYCODE_BUTTON_X: return 2;
            case KeyEvent.KEYCODE_BUTTON_Y: return 3;
            case KeyEvent.KEYCODE_BUTTON_L1: return 4;
            case KeyEvent.KEYCODE_BUTTON_R1: return 5;
            case KeyEvent.KEYCODE_BUTTON_L2: return 6;
            case KeyEvent.KEYCODE_BUTTON_R2: return 7;
            case KeyEvent.KEYCODE_BUTTON_SELECT: return 8;
            case KeyEvent.KEYCODE_BUTTON_START: return 9;
            case KeyEvent.KEYCODE_BUTTON_THUMBL: return 10;
            case KeyEvent.KEYCODE_BUTTON_THUMBR: return 11;
            case KeyEvent.KEYCODE_DPAD_UP: return 12;
            case KeyEvent.KEYCODE_DPAD_DOWN: return 13;
            case KeyEvent.KEYCODE_DPAD_LEFT: return 14;
            case KeyEvent.KEYCODE_DPAD_RIGHT: return 15;
            case KeyEvent.KEYCODE_BUTTON_MODE: return 16;
            default: return -1;
        }
    }

    static boolean isFromGamepad(InputDevice dev, int source) {
        int s = source | (dev != null ? dev.getSources() : 0);
        return (s & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD
                || (s & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK
                || (s & InputDevice.SOURCE_DPAD) == InputDevice.SOURCE_DPAD;
    }

    /**
     * Devuelve true si la tecla es del mando (y entonces no la ve nadie más:
     * ni la página ni Android, así B nunca cierra la app).
     */
    synchronized boolean handleKey(KeyEvent e) {
        int code = e.getKeyCode();
        int b = buttonFor(code);
        boolean gamepad = isFromGamepad(e.getDevice(), e.getSource());

        if (b < 0) return false;
        // La cruceta de un teclado normal no es el mando: que la use la página.
        if (b >= 12 && b <= 15 && !gamepad) return false;

        connected = true;
        setKey(b, e.getAction());
        return true;
    }

    /** "Atrás" de Android (gesto o botón): hace lo mismo que B. */
    synchronized void pressBack(int action) {
        setKey(BTN_B, action);
    }

    private void setKey(int b, int action) {
        if (action == KeyEvent.ACTION_DOWN) {
            keyDown[b] = true;
            latched[b] = true;
        } else if (action == KeyEvent.ACTION_UP) {
            keyDown[b] = false;
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Sticks, gatillos y cruceta analógica                               */
    /* ------------------------------------------------------------------ */

    synchronized boolean handleMotion(MotionEvent e) {
        if (!isFromGamepad(e.getDevice(), e.getSource())) return false;
        if (e.getAction() != MotionEvent.ACTION_MOVE) return false;
        connected = true;

        axes[0] = e.getAxisValue(MotionEvent.AXIS_X);
        axes[1] = e.getAxisValue(MotionEvent.AXIS_Y);
        // Stick derecho: lo normal en Android es Z/RZ, pero hay mandos que usan RX/RY
        // (y entonces Z/RZ son los gatillos). Solo si el mando no tiene Z/RZ se usan RX/RY.
        InputDevice dev = e.getDevice();
        boolean usaRxRy = dev != null
                && (dev.getMotionRange(MotionEvent.AXIS_Z) == null || dev.getMotionRange(MotionEvent.AXIS_RZ) == null)
                && dev.getMotionRange(MotionEvent.AXIS_RX) != null && dev.getMotionRange(MotionEvent.AXIS_RY) != null;
        axes[2] = e.getAxisValue(usaRxRy ? MotionEvent.AXIS_RX : MotionEvent.AXIS_Z);
        axes[3] = e.getAxisValue(usaRxRy ? MotionEvent.AXIS_RY : MotionEvent.AXIS_RZ);

        float lt = Math.max(e.getAxisValue(MotionEvent.AXIS_LTRIGGER), e.getAxisValue(MotionEvent.AXIS_BRAKE));
        float rt = Math.max(e.getAxisValue(MotionEvent.AXIS_RTRIGGER), e.getAxisValue(MotionEvent.AXIS_GAS));
        setAxisButton(6, lt);
        setAxisButton(7, rt);

        float hx = e.getAxisValue(MotionEvent.AXIS_HAT_X);
        float hy = e.getAxisValue(MotionEvent.AXIS_HAT_Y);
        setAxisButton(12, hy < -0.5f ? 1f : 0f);
        setAxisButton(13, hy > 0.5f ? 1f : 0f);
        setAxisButton(14, hx < -0.5f ? 1f : 0f);
        setAxisButton(15, hx > 0.5f ? 1f : 0f);
        return true;
    }

    private void setAxisButton(int b, float v) {
        if (v > 0.5f && axisValue[b] <= 0.5f) latched[b] = true;
        axisValue[b] = v;
    }

    /* ------------------------------------------------------------------ */
    /*  Lo que pide la página                                              */
    /* ------------------------------------------------------------------ */

    /** Formato: "1|b0,b1,...,b16|ax0,ax1,ax2,ax3" (el primer 1 = mando conectado). */
    @JavascriptInterface
    public synchronized String read() {
        StringBuilder sb = new StringBuilder(160);
        sb.append(connected ? '1' : '0').append('|');
        for (int i = 0; i < N_BUTTONS; i++) {
            float v = Math.max(keyDown[i] ? 1f : 0f, axisValue[i]);
            if (latched[i] && v <= 0.5f) v = 1f;   // toque rápido: que se vea una vez
            latched[i] = false;
            if (i > 0) sb.append(',');
            sb.append(v == 0f ? "0" : v == 1f ? "1" : String.valueOf(v));
        }
        sb.append('|');
        for (int j = 0; j < axes.length; j++) {
            if (j > 0) sb.append(',');
            sb.append(axes[j]);
        }
        return sb.toString();
    }

    /** El script pide / suelta "pantalla siempre encendida". */
    @JavascriptInterface
    public void keepScreenOn(final boolean on) {
        activity.runOnUiThread(() -> {
            if (on) activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
    }

    synchronized void refreshConnected() {
        connected = anyGamepadPresent() || connected;
    }

    private static boolean anyGamepadPresent() {
        for (int id : InputDevice.getDeviceIds()) {
            InputDevice d = InputDevice.getDevice(id);
            if (d == null || d.isVirtual()) continue;
            int s = d.getSources();
            if ((s & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD
                    || (s & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK) {
                return true;
            }
        }
        return false;
    }
}
