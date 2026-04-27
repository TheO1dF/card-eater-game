const DEFAULT_CONFIG = {
  discardThreshold: 120,
  eatThreshold: 120,
  maxRotation: 18,
  springDuration: 180,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getPoint(event) {
  if (event.touches && event.touches.length > 0) return { x: event.touches[0].clientX, y: event.touches[0].clientY };
  if (event.changedTouches && event.changedTouches.length > 0) return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
  return { x: event.clientX, y: event.clientY };
}

export function createGestureController(options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  let current = null;
  let cardMeta = null;
  let startX = 0, startY = 0, deltaX = 0, deltaY = 0;
  let rafId = 0;
  let dragging = false;

  function applyTransform(x, y, rotation, opacity) {
    if (!current) return;
    current.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg) scale(1.02)`;
    current.style.opacity = String(opacity);
  }

  function animateBack() {
    if (!current) return;
    current.style.transition = `transform ${config.springDuration}ms ease, opacity ${config.springDuration}ms ease`;
    current.style.transform = "";
    current.style.opacity = "1";
    window.setTimeout(() => {
      if (current) current.style.transition = "";
    }, config.springDuration);
  }

  function unbindWindowListeners() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onEnd);
    window.removeEventListener("pointercancel", onEnd);
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onEnd);
  }

  function resolveAction() {
    if (!current || !cardMeta) return;
    const action = deltaY <= -config.discardThreshold ? "discard" : deltaY >= config.eatThreshold ? "eat" : null;

    if (!action) {
      animateBack();
      return; // 不做任何事，保留监听器
    }

    current.style.transition = `transform ${config.springDuration}ms ease-out, opacity ${config.springDuration}ms ease-out`;
    current.style.transform = `translate3d(${deltaX * 1.6}px, ${action === 'discard' ? -300 : 300}px, 0) rotate(${clamp(deltaX / 8, -45, 45)}deg) scale(0.9)`;
    current.style.opacity = "0";
    
    const finalAction = action;
    const finalCardMeta = cardMeta;
    
    // 清理工作现在都由 onEnd 负责
    current = null;
    cardMeta = null;

    setTimeout(() => {
      if (finalAction === "discard" && config.onDiscard) config.onDiscard(finalCardMeta);
      if (finalAction === "eat" && config.onEat) config.onEat(finalCardMeta);
    }, config.springDuration);
  }
  
  function onMove(event) {
    if (!dragging || !current) return;
    event.preventDefault();
    const point = getPoint(event);
    deltaX = point.x - startX;
    deltaY = point.y - startY;
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      const rotation = clamp(deltaX / 8, -config.maxRotation, config.maxRotation);
      const opacity = clamp(1 - Math.abs(deltaY) / 520, 0.3, 1);
      applyTransform(deltaX, deltaY, rotation, opacity);
    });
  }

  // 【核心修复】onEnd 负责所有清理工作，确保状态一定被重置
  function onEnd(event) {
    if (!dragging) return;
    event.preventDefault();
    unbindWindowListeners();
    resolveAction();
    dragging = false; // 无论如何都重置拖拽状态
  }
  
  function onStart(event) {
    if (dragging || !current) return;
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();

    dragging = true;
    const point = getPoint(event);
    startX = point.x;
    startY = point.y;
    deltaX = 0;
    deltaY = 0;
    current.style.transition = "none";
    
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onEnd, { passive: false });
    window.addEventListener("pointercancel", onEnd, { passive: false }); // 保证取消事件也能触发清理
    window.addEventListener("mousemove", onMove, { passive: false });
    window.addEventListener("mouseup", onEnd, { passive: false });
  }

  return {
    bind(element, card) {
      if (current) {
        current.removeEventListener("pointerdown", onStart);
        current.removeEventListener("mousedown", onStart);
      }
      current = element;
      cardMeta = card;
      if (current) {
        current.style.touchAction = "none";
        current.addEventListener("pointerdown", onStart, { passive: false });
        current.addEventListener("mousedown", onStart, { passive: false });
      }
    },
  };
}