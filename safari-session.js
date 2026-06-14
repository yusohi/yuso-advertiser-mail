(() => {
  const key = "yuso-mail-password";
  const maxAge = 60 * 60 * 24 * 30;
  const secure = location.protocol === "https:" ? "; Secure" : "";

  const cookieValue = () => {
    const prefix = `${encodeURIComponent(key)}=`;
    const found = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix));
    return found ? decodeURIComponent(found.slice(prefix.length)) : "";
  };

  const setCookie = (value) => {
    document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`;
  };

  const removeCookie = () => {
    document.cookie = `${encodeURIComponent(key)}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
  };

  try {
    const saved = localStorage.getItem(key) || cookieValue();
    if (saved) {
      localStorage.setItem(key, saved);
      setCookie(saved);
      document.documentElement.classList.add("has-saved-password");
    }
  } catch {
    // Safari private or in-app sessions can reject storage access.
  }

  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;

  Storage.prototype.setItem = function patchedSetItem(name, value) {
    const result = originalSetItem.apply(this, arguments);
    if (this === localStorage && name === key) setCookie(String(value || ""));
    return result;
  };

  Storage.prototype.removeItem = function patchedRemoveItem(name) {
    const result = originalRemoveItem.apply(this, arguments);
    if (this === localStorage && name === key) removeCookie();
    return result;
  };
})();
