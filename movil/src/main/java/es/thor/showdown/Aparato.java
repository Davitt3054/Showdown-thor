package es.thor.showdown;

import android.content.Context;

/**
 * Esta es la app del MÓVIL (el S23): siempre carga el estilo y el script del
 * móvil. La Thor tiene su propia app aparte (carpeta app/ y web/ del repositorio).
 */
final class Aparato {

    static final String THOR = "thor";
    static final String MOVIL = "movil";

    private Aparato() { }

    static String detectar(Context ctx) {
        return MOVIL;
    }
}
