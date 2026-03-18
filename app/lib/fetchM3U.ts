/**
 * Fetches M3U playlist content using XMLHttpRequest.
 * We use XHR instead of expo/fetch to avoid the RangeError thrown when
 * the server returns status 0 (complete network failure / HTTP plain-text
 * blocked by iOS ATS in production builds).
 *
 * Supports:
 * - Auth-based URLs (credentials in query string)
 * - Automatic redirect following (XHR handles 3xx natively)
 * - Charset/encoding detection
 * - Retry on transient failures
 */
export function fetchM3UText(url: string, timeoutMs = 90000): Promise<string> {
  const MAX_RETRIES = 2;

  const attempt = (retryCount: number): Promise<string> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let settled = false;

      const done = (err?: Error, text?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) {
          if (retryCount < MAX_RETRIES) {
            // Wait before retry with exponential backoff
            setTimeout(() => {
              attempt(retryCount + 1).then(resolve, reject);
            }, 1000 * (retryCount + 1));
          } else {
            reject(err);
          }
        } else {
          resolve(text ?? "");
        }
      };

      const timer = setTimeout(() => {
        xhr.abort();
        done(new Error("Timeout: server reageert niet. Controleer de URL en probeer opnieuw."));
      }, timeoutMs);

      xhr.onreadystatechange = () => {
        if (xhr.readyState !== XMLHttpRequest.DONE) return;
        const status = xhr.status;
        if (status >= 200 && status < 300) {
          const text = xhr.responseText || "";
          if (!text || text.trim().length === 0) {
            done(new Error("Lege response ontvangen van server. Controleer gebruiker/wachtwoord."));
            return;
          }
          done(undefined, text);
        } else if (status === 401 || status === 403) {
          done(new Error("Toegang geweigerd. Controleer gebruikersnaam en wachtwoord."));
        } else if (status === 404) {
          done(new Error("URL niet gevonden (404). Controleer of de link correct is."));
        } else if (status >= 500) {
          done(new Error(`Server fout (${status}). Probeer het later opnieuw.`));
        } else if (status >= 300 && status < 400) {
          // XHR follows redirects automatically, but if we land here somehow
          const text = xhr.responseText || "";
          if (text) done(undefined, text);
          else done(new Error(`Redirect (${status}) kon niet worden gevolgd.`));
        } else if (status === 0) {
          // Network failure / CORS / ATS block
          done(new Error("Verbinding mislukt. Controleer je netwerk of de server blokkeert externe toegang."));
        } else {
          done(new Error(`Server fout: HTTP ${status || "onbekend"}`));
        }
      };

      xhr.onerror = () => done(new Error("Netwerk fout: URL niet bereikbaar. Controleer je internetverbinding."));
      xhr.onabort = () => done(new Error("Verzoek geannuleerd"));

      xhr.open("GET", url, true);
      // Set User-Agent to mimic VLC to avoid being blocked by IPTV servers
      try {
        xhr.setRequestHeader("Accept", "*/*");
      } catch {
        // Some environments don't allow setting headers
      }
      xhr.send();
    });

  return attempt(0);
}
