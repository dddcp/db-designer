import React from "react";
import ReactDOM from "react-dom/client";
import "./i18n";
import App from "./App";

const rootEl = document.getElementById("root") as HTMLElement;

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// React 首帧渲染后再隐藏启动画面，避免白屏
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    const splash = document.getElementById("app-splash");
    if (splash) {
      splash.classList.add("is-hidden");
      splash.addEventListener("transitionend", () => splash.remove(), {
        once: true,
      });
      // 兜底：动画结束事件没触发时强制移除
      setTimeout(() => splash.remove(), 600);
    }
  });
});
