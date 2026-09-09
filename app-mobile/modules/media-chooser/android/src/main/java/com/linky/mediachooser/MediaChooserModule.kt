package com.linky.mediachooser

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Parcelable
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Le selecteur de media NATIF d'Android — celui que le client a montre en
 * capture le 2026-09-09 : « Est-ce que c'est possible d'utiliser le modele
 * integre des telephones ».
 *
 * CE QU'IL VOYAIT, ET POURQUOI IL A FALLU L'ECRIRE. Cet ecran (« Selectionner
 * une action », avec les icones des applications) est fabrique par CHROME quand
 * une page web declare un champ de fichier. Le navigateur combine une intention
 * de capture et une intention de choix de fichier, puis laisse le systeme
 * dresser la liste. Aucune API React Native ne le fait : expo-image-picker
 * ouvre l'appareil photo OU la galerie, jamais le choix entre les deux. Ce
 * module refait exactement la construction du navigateur.
 *
 * CE QU'IL RETOURNE. Toujours des URI file://, jamais content://. La chaine de
 * televersement fait fetch(asset.uri) directement sur la video, et une URI
 * content:// n'y survit pas de facon fiable. Tout ce qui vient de la galerie
 * est donc RECOPIE dans notre cache avant d'etre rendu — c'est ce que fait
 * expo-image-picker, et c'est ce qui permet aux ecrans appelants de ne pas
 * distinguer les deux chemins.
 *
 * LA RECOPIE NE BLOQUE PAS L'INTERFACE. OnActivityResult arrive sur le thread
 * principal ; y recopier une video de 60 s provoquerait un ANR. Le travail part
 * donc sur un thread, et la promesse est resolue depuis celui-ci.
 *
 * REPLI. Cote JS le module est charge par requireOptionalNativeModule : sur un
 * bundle qui tourne encore sur l'ancien binaire il rend null, et l'application
 * reprend sa feuille de choix. Aucun ecran ne casse en attendant le build.
 */
class MediaChooserModule : Module() {
  private var pending: Promise? = null
  private var pendingCameraFile: File? = null
  private var pendingLimit: Int = 1

  override fun definition() = ModuleDefinition {
    Name("LinkyMediaChooser")

    AsyncFunction("chooseImages") { limit: Int, withCamera: Boolean, title: String, promise: Promise ->
      launchChooser(isVideo = false, limit = limit, withCamera = withCamera, title = title, maxSeconds = 0, promise = promise)
    }

    AsyncFunction("chooseVideo") { withCamera: Boolean, title: String, maxSeconds: Int, promise: Promise ->
      launchChooser(isVideo = true, limit = 1, withCamera = withCamera, title = title, maxSeconds = maxSeconds, promise = promise)
    }

    OnActivityResult { _, payload ->
      handleResult(payload.requestCode, payload.resultCode, payload.data)
    }
  }

  private fun launchChooser(
    isVideo: Boolean,
    limit: Int,
    withCamera: Boolean,
    title: String,
    maxSeconds: Int,
    promise: Promise,
  ) {
    val activity = appContext.currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "Aucune activite au premier plan", null)
      return
    }
    // Deux selecteurs a la fois n'arrivent qu'en cas de double appui. On refuse
    // plutot que d'abandonner silencieusement la premiere promesse, qui ne se
    // resoudrait jamais et laisserait l'ecran en televersement perpetuel.
    if (pending != null) {
      promise.reject("BUSY", "Un selecteur est deja ouvert", null)
      return
    }

    val content = Intent(Intent.ACTION_GET_CONTENT).apply {
      type = if (isVideo) "video/*" else "image/*"
      addCategory(Intent.CATEGORY_OPENABLE)
      if (!isVideo && limit > 1) putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
    }
    val chooser = Intent.createChooser(content, title)

    var cameraFile: File? = null
    if (withCamera) {
      val capture = buildCaptureIntent(activity, isVideo, maxSeconds)
      if (capture != null) {
        cameraFile = capture.second
        chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf<Parcelable>(capture.first))
      }
    }

    pending = promise
    pendingLimit = if (limit < 1) 1 else limit
    pendingCameraFile = cameraFile

    try {
      activity.startActivityForResult(chooser, if (isVideo) REQUEST_VIDEO else REQUEST_IMAGES)
    } catch (e: Exception) {
      pending = null
      pendingCameraFile = null
      cameraFile?.delete()
      promise.reject("LAUNCH_FAILED", e.message ?: "Impossible d'ouvrir le selecteur", e)
    }
  }

  /**
   * L'intention de capture, et le fichier ou l'appareil photo doit ecrire.
   *
   * Sans EXTRA_OUTPUT, ACTION_IMAGE_CAPTURE ne rend qu'une VIGNETTE dans les
   * extras — inutilisable pour une annonce. D'ou le FileProvider.
   *
   * Rend null si aucune application ne sait capturer : le selecteur s'ouvre
   * alors sans l'entree appareil photo, plutot qu'avec une entree morte.
   */
  private fun buildCaptureIntent(activity: Activity, isVideo: Boolean, maxSeconds: Int): Pair<Intent, File>? {
    return try {
      val intent = Intent(if (isVideo) MediaStore.ACTION_VIDEO_CAPTURE else MediaStore.ACTION_IMAGE_CAPTURE)
      if (intent.resolveActivity(activity.packageManager) == null) return null

      val dir = File(activity.cacheDir, CACHE_DIR)
      dir.mkdirs()
      val file = File.createTempFile(
        if (isVideo) "capture-" else "photo-",
        if (isVideo) ".mp4" else ".jpg",
        dir,
      )
      val uri = FileProvider.getUriForFile(
        activity,
        activity.packageName + ".LinkyMediaChooserProvider",
        file,
      )
      intent.putExtra(MediaStore.EXTRA_OUTPUT, uri)
      intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
      // Coupe A LA PRISE plutot que de refuser apres coup : filmer trois minutes
      // puis se faire jeter est la pire facon de l'apprendre.
      if (isVideo && maxSeconds > 0) intent.putExtra(MediaStore.EXTRA_DURATION_LIMIT, maxSeconds)
      Pair(intent, file)
    } catch (e: Exception) {
      null
    }
  }

  private fun handleResult(requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != REQUEST_IMAGES && requestCode != REQUEST_VIDEO) return
    val promise = pending ?: return
    pending = null

    val isVideo = requestCode == REQUEST_VIDEO
    val cameraFile = pendingCameraFile
    val limit = pendingLimit
    pendingCameraFile = null

    if (resultCode != Activity.RESULT_OK) {
      cameraFile?.delete()
      promise.resolve(emptyList<Map<String, Any?>>())
      return
    }

    val context = appContext.reactContext
    if (context == null) {
      cameraFile?.delete()
      promise.reject("NO_CONTEXT", "Contexte perdu", null)
      return
    }

    // Hors du thread principal : la recopie d'une video prend plusieurs
    // secondes, et OnActivityResult arrive sur l'UI.
    Thread {
      try {
        val picked = ArrayList<Uri>()
        val clip = data?.clipData
        val single = data?.data
        if (clip != null) {
          val count = if (clip.itemCount < limit) clip.itemCount else limit
          for (i in 0 until count) picked.add(clip.getItemAt(i).uri)
        } else if (single != null) {
          picked.add(single)
        }

        val out = ArrayList<Map<String, Any?>>()
        if (picked.isEmpty()) {
          // Rien dans l'intention : c'est l'appareil photo, qui a ecrit dans
          // notre fichier. Certaines applications rendent AUSSI une URI, d'ou
          // l'ordre — l'intention d'abord, le fichier ensuite.
          if (cameraFile != null && cameraFile.length() > 0L) {
            out.add(describeFile(cameraFile, cameraFile.name, if (isVideo) "video/mp4" else "image/jpeg", isVideo))
          }
        } else {
          cameraFile?.delete()
          for (uri in picked) {
            val imported = importUri(context, uri, isVideo)
            if (imported != null) out.add(imported)
          }
        }
        promise.resolve(out)
      } catch (e: Exception) {
        cameraFile?.delete()
        promise.reject("READ_FAILED", e.message ?: "Lecture impossible", e)
      }
    }.start()
  }

  /** Recopie une URI content:// dans le cache, puis la decrit. */
  private fun importUri(context: Context, uri: Uri, isVideo: Boolean): Map<String, Any?>? {
    val resolver = context.contentResolver
    val mime = resolver.getType(uri) ?: if (isVideo) "video/mp4" else "image/jpeg"

    var displayName: String? = null
    try {
      resolver.query(uri, null, null, null, null)?.use { c ->
        if (c.moveToFirst()) {
          val ni = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
          if (ni >= 0 && !c.isNull(ni)) displayName = c.getString(ni)
        }
      }
    } catch (e: Exception) {
      // Un fournisseur peut refuser la requete de metadonnees sans refuser le
      // flux : on continue avec un nom par defaut.
      displayName = null
    }

    val ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime)
      ?: if (isVideo) "mp4" else "jpg"
    val dir = File(context.cacheDir, CACHE_DIR)
    dir.mkdirs()
    val dest = File.createTempFile("pick-", "." + ext, dir)
    val input = resolver.openInputStream(uri)
    if (input == null) {
      dest.delete()
      return null
    }
    input.use { stream ->
      dest.outputStream().use { output -> stream.copyTo(output) }
    }
    return describeFile(dest, displayName ?: dest.name, mime, isVideo)
  }

  private fun describeFile(file: File, name: String, mime: String, isVideo: Boolean): Map<String, Any?> {
    var durationMs: Double? = null
    if (isVideo) {
      // La duree sert au plafond de 60 s cote appelant. Sans elle, le plafond
      // cesserait de s'appliquer EN SILENCE — pire que pas de plafond du tout.
      val retriever = MediaMetadataRetriever()
      try {
        retriever.setDataSource(file.absolutePath)
        durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toDoubleOrNull()
      } catch (e: Exception) {
        durationMs = null
      } finally {
        try {
          retriever.release()
        } catch (e: Exception) {
          // rien a faire
        }
      }
    }
    return mapOf(
      "uri" to Uri.fromFile(file).toString(),
      "fileName" to name,
      "mimeType" to mime,
      "fileSize" to file.length().toDouble(),
      "duration" to durationMs,
    )
  }

  companion object {
    private const val REQUEST_IMAGES = 0x4C49
    private const val REQUEST_VIDEO = 0x4C56
    private const val CACHE_DIR = "linky-media"
  }
}
