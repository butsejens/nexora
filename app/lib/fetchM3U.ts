/**
 * Fetches M3U playlist content using XMLHttpRequest.
 * We use XHR instead of expo/fetch to avoid the RangeError thrown when
 * the server returns status 0 (complete network failure / HTTP plain-text
 * blocked by iOS ATS in production builds).
 */
export function fetchM3UText(url: string, timeoutMs = 90000): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;

    const done = (err?: Error, text?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(text ?? "");
    };

    const timer = setTimeout(() => {
      xhr.abort();
      done(new Error("Timeout: server reageert niet na 90 seconden"));
    }, timeoutMs);

    xhr.onreadystatechange = () => {
      if (xhr.readyState !== XMLHttpRequest.DONE) return;
      const status = xhr.status;
      if (status >= 200 && status < 600) {
        const text = xhr.responseText || "";
        done(undefined, text);
      } else {
        done(new Error(`Server gaf HTTP-status ${status || "onbekend"} terug`));
      }
    };

    xhr.onerror = () => done(new Error("Netwerkfout: URL niet bereikbaar"));
    xhr.onabort = () => done(new Error("Verzoek geannuleerd"));

    xhr.open("GET", url, true);
    xhr.send();
  });
}
