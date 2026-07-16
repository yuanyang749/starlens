// 中文注释：GSAP 在模块初始化时读取媒体查询；为 jsdom 用例提供最小浏览器实现。
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() { return false; },
    }),
  });
}
