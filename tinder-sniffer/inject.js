// inject.js — content script to insert interceptor into page context
(function () {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('interceptor.js');
    script.onload = function () {
      this.remove(); // cleanup after injection
    };
    (document.head || document.documentElement).appendChild(script);
  })();
  