package es.thor.showdown;

import android.content.Context;
import android.hardware.display.DisplayManager;
import android.os.Build;
import android.util.DisplayMetrics;
import android.view.Display;
import android.view.InputDevice;
import android.view.Surface;

import java.util.Locale;

/**
 * ¿En qué aparato está la app?
 *
 * - "thor": consola con mando (la AYN Thor u otra parecida). En horizontal,
 *   con el estilo y el script del mando, y la pantalla de abajo si la hay.
 * - "movil": cualquier móvil normal (el S23, por ejemplo). En vertical y
 *   táctil, con el estilo y el script del móvil.
 *
 * Es la misma app (el mismo .apk) para los dos: solo cambia lo que se carga.
 */
final class Aparato {

    static final String THOR = "thor";
    static final String MOVIL = "movil";

    private Aparato() { }

    static String detectar(Context ctx) {
        // 1) Por el nombre: la Thor (y las Odin) son de AYN.
        String nombre = (Build.MANUFACTURER + " " + Build.BRAND + " " + Build.MODEL + " "
                + Build.DEVICE + " " + Build.PRODUCT).toLowerCase(Locale.ROOT);
        if (nombre.contains("ayn") || nombre.contains("thor") || nombre.contains("odin")) return THOR;

        // 2) Por el mando de serie: en la Thor se llama "Odin Controller".
        boolean hayMando = false;
        for (int id : InputDevice.getDeviceIds()) {
            InputDevice dev = InputDevice.getDevice(id);
            if (dev == null) continue;
            String n = dev.getName() == null ? "" : dev.getName().toLowerCase(Locale.ROOT);
            if (n.contains("odin") || n.contains("ayn")) return THOR;
            int s = dev.getSources();
            if (!dev.isVirtual() && (s & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD) hayMando = true;
        }

        DisplayManager dm = (DisplayManager) ctx.getSystemService(Context.DISPLAY_SERVICE);
        if (dm != null) {
            // 3) Por la pantalla de abajo de la Thor (1240×1080).
            for (Display d : dm.getDisplays()) {
                if (d.getDisplayId() == Display.DEFAULT_DISPLAY) continue;
                Display.Mode m = d.getMode();
                int w = m.getPhysicalWidth(), h = m.getPhysicalHeight();
                if ((w == 1240 && h == 1080) || (w == 1080 && h == 1240)) return THOR;
            }
            // 4) Consola parecida: pantalla horizontal "de serie" y mando de serie.
            Display principal = dm.getDisplay(Display.DEFAULT_DISPLAY);
            if (hayMando && principal != null && horizontalDeSerie(principal)) return THOR;
        }
        return MOVIL;
    }

    /** True si la pantalla, sin girar, es más ancha que alta (consolas); los móviles son al revés. */
    @SuppressWarnings("deprecation")
    private static boolean horizontalDeSerie(Display d) {
        DisplayMetrics dm = new DisplayMetrics();
        d.getRealMetrics(dm);
        int rot = d.getRotation();
        boolean girada = rot == Surface.ROTATION_90 || rot == Surface.ROTATION_270;
        int w = girada ? dm.heightPixels : dm.widthPixels;
        int h = girada ? dm.widthPixels : dm.heightPixels;
        return w > h;
    }
}
