package app.alextran.immich.core

import android.content.Context
import android.content.SharedPreferences
import android.security.KeyChain
import androidx.core.content.edit
import app.alextran.immich.BuildConfig
import app.alextran.immich.NativeBuffer
import okhttp3.Cache
import okhttp3.ConnectionPool
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.Credentials
import okhttp3.Dispatcher
import okhttp3.Headers
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.File
import java.net.Socket
import java.security.KeyStore
import java.security.Principal
import java.security.PrivateKey
import java.security.cert.X509Certificate
import java.util.concurrent.TimeUnit
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509KeyManager
import javax.net.ssl.X509TrustManager

const val USER_AGENT = "Immich_Android_${BuildConfig.VERSION_NAME}"
private const val CERT_ALIAS = "client_cert"
private const val PREFS_NAME = "immich.ssl"
private const val PREFS_CERT_ALIAS = "immich.client_cert"
private const val PREFS_HEADERS = "immich.request_headers"
private const val PREFS_SERVER_URL = "immich.server_url"

/**
 * Manages a shared OkHttpClient with SSL configuration support.
 */
object HttpClientManager {
  private const val CACHE_SIZE_BYTES = 100L * 1024 * 1024  // 100MiB
  private const val KEEP_ALIVE_CONNECTIONS = 10
  private const val KEEP_ALIVE_DURATION_MINUTES = 5L
  private const val MAX_REQUESTS_PER_HOST = 64

  private var initialized = false
  private val clientChangedListeners = mutableListOf<() -> Unit>()

  private lateinit var client: OkHttpClient
  private lateinit var appContext: Context
  private lateinit var prefs: SharedPreferences

  private val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

  var keyChainAlias: String? = null
    private set

  var headers: Headers = Headers.headersOf()
    private set

  private val cookieJar = InMemoryCookieJar()

  val isMtls: Boolean get() = keyChainAlias != null || keyStore.containsAlias(CERT_ALIAS)

  fun initialize(context: Context) {
    if (initialized) return
    synchronized(this) {
      if (initialized) return

      appContext = context.applicationContext
      prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      keyChainAlias = prefs.getString(PREFS_CERT_ALIAS, null)

      val savedHeaders = prefs.getString(PREFS_HEADERS, null)
      if (savedHeaders != null) {
        val json = JSONObject(savedHeaders)
        val headerMap = mutableMapOf<String, String>()
        for (key in json.keys()) {
          headerMap[key] = json.getString(key)
        }
        val serverUrl = prefs.getString(PREFS_SERVER_URL, null)
        applyHeaders(headerMap, listOfNotNull(serverUrl))
      }

      val cacheDir = File(File(context.cacheDir, "okhttp"), "api")
      client = build(cacheDir)
      initialized = true
    }
  }

  fun setKeyChainAlias(alias: String) {
    synchronized(this) {
      val wasMtls = isMtls
      keyChainAlias = alias
      prefs.edit { putString(PREFS_CERT_ALIAS, alias) }

      if (wasMtls != isMtls) {
        clientChangedListeners.forEach { it() }
      }
    }
  }

  fun setKeyEntry(clientData: ByteArray, password: CharArray) {
    synchronized(this) {
      val wasMtls = isMtls
      val tmpKeyStore = KeyStore.getInstance("PKCS12").apply {
        ByteArrayInputStream(clientData).use { stream -> load(stream, password) }
      }
      val tmpAlias = tmpKeyStore.aliases().asSequence().firstOrNull { tmpKeyStore.isKeyEntry(it) }
        ?: throw IllegalArgumentException("No private key found in PKCS12")
      val key = tmpKeyStore.getKey(tmpAlias, password)
      val chain = tmpKeyStore.getCertificateChain(tmpAlias)

      if (keyStore.containsAlias(CERT_ALIAS)) {
        keyStore.deleteEntry(CERT_ALIAS)
      }
      keyStore.setKeyEntry(CERT_ALIAS, key, null, chain)
      if (wasMtls != isMtls) {
        clientChangedListeners.forEach { it() }
      }
    }
  }

  fun deleteKeyEntry() {
    synchronized(this) {
      val wasMtls = isMtls

      if (keyChainAlias != null) {
        keyChainAlias = null
        prefs.edit { remove(PREFS_CERT_ALIAS) }
      }

      keyStore.deleteEntry(CERT_ALIAS)

      if (wasMtls) {
        clientChangedListeners.forEach { it() }
      }
    }
  }

  private var clientGlobalRef: Long = 0L

  @JvmStatic
  fun getClient(): OkHttpClient {
    return client
  }

  fun getClientPointer(): Long {
    if (clientGlobalRef == 0L) {
      clientGlobalRef = NativeBuffer.createGlobalRef(client)
    }
    return clientGlobalRef
  }

  fun addClientChangedListener(listener: () -> Unit) {
    synchronized(this) { clientChangedListeners.add(listener) }
  }

  fun setRequestHeaders(headerMap: Map<String, String>, serverUrls: List<String>) {
    synchronized(this) {
      applyHeaders(headerMap, serverUrls)
      val newUrl = serverUrls.firstOrNull()
      prefs.edit {
        putString(PREFS_HEADERS, JSONObject(headerMap).toString())
        if (newUrl != null) putString(PREFS_SERVER_URL, newUrl) else remove(PREFS_SERVER_URL)
      }
    }
  }

  private fun applyHeaders(headerMap: Map<String, String>, serverUrls: List<String>) {
    val token = headerMap["x-immich-user-token"]
    val builder = Headers.Builder()
    headerMap.forEach { (key, value) ->
      if (key != "x-immich-user-token") builder[key] = value
    }
    headers = builder.build()
    if (token == null) return

    val expiry = System.currentTimeMillis() + 400L * 24 * 60 * 60 * 1000
    for (serverUrl in serverUrls) {
      val url = serverUrl.toHttpUrlOrNull() ?: continue
      cookieJar.saveFromResponse(url, listOf(
        cookie(url, "immich_access_token", token, expiry, httpOnly = true),
        cookie(url, "immich_is_authenticated", "true", expiry, httpOnly = false),
        cookie(url, "immich_auth_type", "password", expiry, httpOnly = true),
      ))
    }
  }

  private fun cookie(url: HttpUrl, name: String, value: String, expiry: Long, httpOnly: Boolean): Cookie {
    return Cookie.Builder().name(name).value(value).domain(url.host).path("/").expiresAt(expiry)
      .apply {
        if (url.isHttps) secure()
        if (httpOnly) httpOnly()
      }.build()
  }

  fun loadCookieHeader(url: String): String? {
    val httpUrl = url.toHttpUrlOrNull() ?: return null
    val cookies = cookieJar.loadForRequest(httpUrl)
    if (cookies.isEmpty()) return null
    return cookies.joinToString("; ") { "${it.name}=${it.value}" }
  }

  private fun build(cacheDir: File): OkHttpClient {
    val connectionPool = ConnectionPool(
      maxIdleConnections = KEEP_ALIVE_CONNECTIONS,
      keepAliveDuration = KEEP_ALIVE_DURATION_MINUTES,
      timeUnit = TimeUnit.MINUTES
    )

    val managerFactory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
    managerFactory.init(null as KeyStore?)
    val trustManager = managerFactory.trustManagers.filterIsInstance<X509TrustManager>().first()

    val sslContext = SSLContext.getInstance("TLS")
      .apply { init(arrayOf(DynamicKeyManager()), arrayOf(trustManager), null) }
    HttpsURLConnection.setDefaultSSLSocketFactory(sslContext.socketFactory)

    return OkHttpClient.Builder()
      .cookieJar(cookieJar)
      .addInterceptor {
        val request = it.request()
        val builder = request.newBuilder()
        builder.header("User-Agent", USER_AGENT)
        headers.forEach { (key, value) -> builder.header(key, value) }
        val url = request.url
        if (url.username.isNotEmpty()) {
          builder.header("Authorization", Credentials.basic(url.username, url.password))
        }
        it.proceed(builder.build())
      }
      .connectionPool(connectionPool)
      .dispatcher(Dispatcher().apply { maxRequestsPerHost = MAX_REQUESTS_PER_HOST })
      .cache(Cache(cacheDir.apply { mkdirs() }, CACHE_SIZE_BYTES))
      .sslSocketFactory(sslContext.socketFactory, trustManager)
      .build()
  }

  /**
   * Resolves client certificates dynamically at TLS handshake time.
   * Checks the system KeyChain alias first, then falls back to the app's private KeyStore.
   */
  private class DynamicKeyManager : X509KeyManager {
    override fun getClientAliases(keyType: String, issuers: Array<Principal>?): Array<String>? {
      val alias = chooseClientAlias(arrayOf(keyType), issuers, null) ?: return null
      return arrayOf(alias)
    }

    override fun chooseClientAlias(
      keyTypes: Array<String>,
      issuers: Array<Principal>?,
      socket: Socket?
    ): String? {
      keyChainAlias?.let { return it }
      if (keyStore.containsAlias(CERT_ALIAS)) return CERT_ALIAS
      return null
    }

    override fun getCertificateChain(alias: String): Array<X509Certificate>? {
      if (alias == keyChainAlias) {
        return KeyChain.getCertificateChain(appContext, alias)
      }
      return keyStore.getCertificateChain(alias)?.map { it as X509Certificate }?.toTypedArray()
    }

    override fun getPrivateKey(alias: String): PrivateKey? {
      if (alias == keyChainAlias) {
        return KeyChain.getPrivateKey(appContext, alias)
      }
      return keyStore.getKey(alias, null) as? PrivateKey
    }

    override fun getServerAliases(keyType: String, issuers: Array<Principal>?): Array<String>? =
      null

    override fun chooseServerAlias(
      keyType: String,
      issuers: Array<Principal>?,
      socket: Socket?
    ): String? = null
  }

  private class InMemoryCookieJar : CookieJar {
    private val store = mutableListOf<Cookie>()

    @Synchronized
    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
      store.removeAll { existing ->
        cookies.any { it.name == existing.name && it.domain == existing.domain && it.path == existing.path }
      }
      store.addAll(cookies)
    }

    @Synchronized
    override fun loadForRequest(url: HttpUrl): List<Cookie> {
      val now = System.currentTimeMillis()
      store.removeAll { it.expiresAt < now }
      return store.filter { it.matches(url) }
    }
  }
}
