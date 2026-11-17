package es.thor.showdown;

import android.content.Context;
import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

/**
 * El estilo (estilo.css) y el script del mando (mando.user.js).
 *
 * Al arrancar se intenta bajar la versión más nueva del repositorio. Si no se
 * puede (sin internet, repositorio privado...), se usa la última que se bajó
 * bien y, si nunca se bajó, la copia que va dentro de la app.
 */
final class WebAssets {

    private static final String TAG = "ShowdownThor";

    /** Carpeta /web de la rama principal del repositorio. */
    static final String REMOTE_BASE =
            "https://raw.githubusercontent.com/Davitt3054/Showdown-thor/main/web/";

    static final String CSS = "estilo.css";
    static final String MANDO = "mando.user.js";

    /** Tiempo máximo que esperamos a la descarga antes de abrir Showdown. */
    private static final long MAX_WAIT_MS = 4500;

    static final class Item {
        final String text;
        final String origin;   // "descargado", "guardado" o "app"
        Item(String text, String origin) { this.text = text; this.origin = origin; }
    }

    static final class Bundle {
        Item css;
        Item mando;
        String puente;
    }

    /** Se llama fuera del hilo principal (puede tardar unos segundos). */
    static Bundle load(Context ctx) {
        ExecutorService pool = Executors.newFixedThreadPool(2);
        Future<String> fCss = pool.submit(() -> download(CSS));
        Future<String> fMando = pool.submit(() -> download(MANDO));
        long deadline = System.currentTimeMillis() + MAX_WAIT_MS;

        Bundle b = new Bundle();
        b.css = pick(ctx, CSS, waitFor(fCss, deadline));
        b.mando = pick(ctx, MANDO, waitFor(fMando, deadline));
        b.puente = readAsset(ctx, "puente.js");
        pool.shutdownNow();
        Log.i(TAG, "estilo: " + b.css.origin + " · mando: " + b.mando.origin);
        return b;
    }

    private static String waitFor(Future<String> f, long deadline) {
        try {
            long left = Math.max(1, deadline - System.currentTimeMillis());
            return f.get(left, TimeUnit.MILLISECONDS);
        } catch (Exception e) {
            f.cancel(true);
            return null;
        }
    }

    private static Item pick(Context ctx, String name, String downloaded) {
        File cache = new File(new File(ctx.getFilesDir(), "web"), name);
        if (downloaded != null) {
            save(cache, downloaded);
            return new Item(downloaded, "descargado");
        }
        String cached = readFile(cache);
        if (looksValid(name, cached)) return new Item(cached, "guardado");
        return new Item(readAsset(ctx, name), "app");
    }

    /** Evita usar una página de error (404, "Not Found"...) como si fuera el estilo. */
    static boolean looksValid(String name, String text) {
        if (text == null) return false;
        String t = text.trim();
        if (t.length() < 200 || t.startsWith("<")) return false;
        if (name.endsWith(".css")) return t.contains("{") && t.contains("}");
        return t.contains("function");
    }

    private static String download(String name) {
        HttpURLConnection c = null;
        try {
            URL url = new URL(REMOTE_BASE + name + "?t=" + System.currentTimeMillis());
            c = (HttpURLConnection) url.openConnection();
            c.setConnectTimeout(3000);
            c.setReadTimeout(4000);
            c.setUseCaches(false);
            c.setRequestProperty("Cache-Control", "no-cache");
            if (c.getResponseCode() != 200) return null;
            try (InputStream in = c.getInputStream()) {
                String text = readAll(in);
                return looksValid(name, text) ? text : null;
            }
        } catch (Exception e) {
            Log.i(TAG, "no se pudo bajar " + name + ": " + e);
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static void save(File f, String text) {
        try {
            File dir = f.getParentFile();
            if (dir != null && !dir.exists()) dir.mkdirs();
            File tmp = new File(f.getPath() + ".tmp");
            try (FileOutputStream out = new FileOutputStream(tmp)) {
                out.write(text.getBytes(StandardCharsets.UTF_8));
            }
            if (!tmp.renameTo(f)) Log.w(TAG, "no se pudo guardar " + f);
        } catch (IOException e) {
            Log.w(TAG, "no se pudo guardar " + f + ": " + e);
        }
    }

    private static String readFile(File f) {
        if (!f.exists()) return null;
        try (InputStream in = new FileInputStream(f)) {
            return readAll(in);
        } catch (IOException e) {
            return null;
        }
    }

    static String readAsset(Context ctx, String name) {
        try (InputStream in = ctx.getAssets().open(name)) {
            return readAll(in);
        } catch (IOException e) {
            Log.e(TAG, "falta el archivo " + name + " dentro de la app", e);
            return "";
        }
    }

    private static String readAll(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return out.toString("UTF-8");
    }

    /* ------------------------------------------------------------------ */
    /*  Cómo se mete cada cosa en la página                                */
    /* ------------------------------------------------------------------ */

    /**
     * Quita el envoltorio de Stylus "@-moz-document domain(...) { ... }",
     * que solo entiende Firefox. Lo de dentro se queda tal cual.
     */
    static String unwrapUserStyle(String css) {
        int at = css.indexOf("@-moz-document");
        if (at < 0) return css;
        int open = css.indexOf('{', at);
        int close = css.lastIndexOf('}');
        if (open < 0 || close <= open) return css;
        return css.substring(0, at) + css.substring(open + 1, close) + css.substring(close + 1);
    }

    /** Script que pone el estilo como lo haría Stylus (al final de la página). */
    static String styleInjector(String css) {
        String quoted = org.json.JSONObject.quote(unwrapUserStyle(css));
        return "(function(){\n"
                + "if (window.top !== window || window.__thorEstilo) return;\n"
                + "window.__thorEstilo = true;\n"
                + "var s = document.createElement('style');\n"
                + "s.id = 'thor-estilo';\n"
                + "s.textContent = " + quoted + ";\n"
                + "function poner(){ var r = document.documentElement; if (r) r.appendChild(s); }\n"
                + "poner();\n"
                + "document.addEventListener('DOMContentLoaded', poner);\n"
                + "})();";
    }

    /** Script del mando, que arranca cuando la página ya está cargada (como Violentmonkey). */
    static String mandoInjector(String mando) {
        return "(function(){\n"
                + "if (window.top !== window || window.__thorMandoCargado) return;\n"
                + "window.__thorMandoCargado = true;\n"
                + "function arrancar(){\ntry {\n"
                + mando
                + "\n} catch (e) { console.error('Showdown Thor · error en el script del mando', e); }\n}\n"
                + "if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ setTimeout(arrancar, 0); });\n"
                + "else setTimeout(arrancar, 0);\n"
                + "})();";
    }
}
