(function () {
  var s = document.currentScript;
  var n = document.createElement("script");
  var origin = s && s.src ? new URL(s.src).origin : window.location.origin;
  n.src = origin + "/ai-widget.js";
  if (s) {
    for (var i = 0; i < s.attributes.length; i++) {
      var a = s.attributes[i];
      if (a.name.indexOf("data-") === 0) n.setAttribute(a.name, a.value);
    }
  }
  n.async = true;
  (s && s.parentNode ? s.parentNode : document.head).insertBefore(n, s ? s.nextSibling : null);
})();
