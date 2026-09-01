(function () {
  if (window.__aiWidgetLoaded) return;
  window.__aiWidgetLoaded = true;

  var script = document.currentScript;
  var origin = script && script.src ? new URL(script.src).origin : window.location.origin;
  var key = (script && script.getAttribute("data-widget-key")) || "";
  var position = ((script && script.getAttribute("data-position")) || "bottom-right").toLowerCase();
  var isLeft = position === "bottom-left";

  var btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-label", "Open assistant");
  btn.textContent = "Chat";
  btn.style.cssText = [
    "position:fixed",
    isLeft ? "left:16px" : "right:16px",
    "bottom:16px",
    "z-index:2147483647",
    "background:#0f766e",
    "color:#fff",
    "border:0",
    "border-radius:999px",
    "padding:12px 18px",
    "font:600 14px/1.2 system-ui,sans-serif",
    "cursor:pointer",
    "box-shadow:0 8px 24px rgba(0,0,0,.2)",
  ].join(";");

  var frame = document.createElement("iframe");
  var parentOrigin = encodeURIComponent(window.location.origin);
  var src =
    origin +
    "/embed?key=" +
    encodeURIComponent(key) +
    "&parent=" +
    parentOrigin +
    "&position=" +
    encodeURIComponent(position);
  frame.src = src;
  frame.title = "Assistant";
  frame.setAttribute("sandbox", "allow-scripts allow-forms allow-same-origin");
  frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  frame.style.cssText = [
    "position:fixed",
    isLeft ? "left:16px" : "right:16px",
    "bottom:72px",
    "z-index:2147483647",
    "width:360px",
    "max-width:calc(100vw - 24px)",
    "height:520px",
    "max-height:min(70vh, calc(100dvh - 96px))",
    "border:0",
    "border-radius:16px",
    "box-shadow:0 16px 50px rgba(0,0,0,.25)",
    "display:none",
    "background:#fff",
  ].join(";");

  function applyMobile() {
    var mobile = window.matchMedia("(max-width: 640px)").matches;
    if (mobile) {
      frame.style.left = "0";
      frame.style.right = "0";
      frame.style.bottom = "0";
      frame.style.width = "100vw";
      frame.style.maxWidth = "100vw";
      frame.style.height = "100dvh";
      frame.style.maxHeight = "100dvh";
      frame.style.borderRadius = "0";
    } else {
      frame.style.left = isLeft ? "16px" : "";
      frame.style.right = isLeft ? "" : "16px";
      frame.style.bottom = "72px";
      frame.style.width = "360px";
      frame.style.maxWidth = "calc(100vw - 24px)";
      frame.style.height = "520px";
      frame.style.maxHeight = "min(70vh, calc(100dvh - 96px))";
      frame.style.borderRadius = "16px";
    }
  }
  applyMobile();
  window.addEventListener("resize", applyMobile);

  var open = false;
  btn.addEventListener("click", function () {
    open = !open;
    frame.style.display = open ? "block" : "none";
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.textContent = open ? "Close" : "Chat";
  });

  function mount() {
    document.body.appendChild(frame);
    document.body.appendChild(btn);
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);

  if (key) {
    fetch(origin + "/api/widget/config?key=" + encodeURIComponent(key) + "&parent=" + parentOrigin, {
      headers: {
        "x-widget-key": key,
        "x-widget-parent-origin": window.location.origin,
      },
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (json) {
        if (!json || !json.success || !json.data) return;
        if (json.data.primaryColor) btn.style.background = json.data.primaryColor;
        if (json.data.title) {
          frame.title = json.data.title;
          btn.setAttribute("aria-label", "Open " + json.data.title);
        }
      })
      .catch(function () {});
  }
})();
