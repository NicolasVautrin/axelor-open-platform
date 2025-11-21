// vite-dev.config.ts
import react2 from "file:///C:/Users/nicolasv/axelor-open-platform-7.4/axelor-front/node_modules/.pnpm/@vitejs+plugin-react@4.7.0_vite@5.4.21_@types+node@22.19.1_sass@1.94.0_terser@5.44.1_/node_modules/@vitejs/plugin-react/dist/index.js";
import jotaiDebugLabel from "file:///C:/Users/nicolasv/axelor-open-platform-7.4/axelor-front/node_modules/.pnpm/jotai@2.15.1_@babel+core@7.28.5_@babel+template@7.27.2_@types+react@18.3.26_react@18.3.1/node_modules/jotai/esm/babel/plugin-debug-label.mjs";
import jotaiReactRefresh from "file:///C:/Users/nicolasv/axelor-open-platform-7.4/axelor-front/node_modules/.pnpm/jotai@2.15.1_@babel+core@7.28.5_@babel+template@7.27.2_@types+react@18.3.26_react@18.3.1/node_modules/jotai/esm/babel/plugin-react-refresh.mjs";
import { loadEnv, mergeConfig } from "file:///C:/Users/nicolasv/axelor-open-platform-7.4/axelor-front/node_modules/.pnpm/vite@5.4.21_@types+node@22.19.1_sass@1.94.0_terser@5.44.1/node_modules/vite/dist/node/index.js";
import { defineConfig as defineConfig2 } from "file:///C:/Users/nicolasv/axelor-open-platform-7.4/axelor-front/node_modules/.pnpm/vitest@2.1.9_@types+node@22.19.1_jsdom@25.0.1_sass@1.94.0_terser@5.44.1/node_modules/vitest/dist/config.js";

// vite.config.ts
import legacy from "file:///C:/Users/nicolasv/axelor-open-platform-7.4/axelor-front/node_modules/.pnpm/@vitejs+plugin-legacy@5.4.3_terser@5.44.1_vite@5.4.21_@types+node@22.19.1_sass@1.94.0_terser@5.44.1_/node_modules/@vitejs/plugin-legacy/dist/index.mjs";
import react from "file:///C:/Users/nicolasv/axelor-open-platform-7.4/axelor-front/node_modules/.pnpm/@vitejs+plugin-react@4.7.0_vite@5.4.21_@types+node@22.19.1_sass@1.94.0_terser@5.44.1_/node_modules/@vitejs/plugin-react/dist/index.js";
import path from "path";
import { defineConfig } from "file:///C:/Users/nicolasv/axelor-open-platform-7.4/axelor-front/node_modules/.pnpm/vite@5.4.21_@types+node@22.19.1_sass@1.94.0_terser@5.44.1/node_modules/vite/dist/node/index.js";
import svgr from "file:///C:/Users/nicolasv/axelor-open-platform-7.4/axelor-front/node_modules/.pnpm/vite-plugin-svgr@4.5.0_rollup@4.53.2_typescript@5.9.3_vite@5.4.21_@types+node@22.19.1_sass@1.94.0_terser@5.44.1_/node_modules/vite-plugin-svgr/dist/index.js";
var __vite_injected_original_dirname = "C:\\Users\\nicolasv\\axelor-open-platform-7.4\\axelor-front";
var vite_config_default = defineConfig({
  base: "./",
  plugins: [
    react(),
    svgr({
      svgrOptions: {
        icon: true
      }
    }),
    legacy({
      modernPolyfills: true,
      renderLegacyChunks: false
    })
  ],
  optimizeDeps: {
    entries: ["src/**/*.{ts,js,tsx,jsx,css,scss,html}"]
  },
  resolve: {
    alias: [
      {
        find: /^~(.*)/,
        replacement: "$1"
      },
      {
        find: /^@\/(.*)/,
        replacement: path.join(__vite_injected_original_dirname, "src", "$1")
      }
    ]
  },
  build: {
    target: ["es2022"]
  }
});

// vite-dev.config.ts
var env = loadEnv("dev", process.cwd(), "");
var base = env.VITE_PROXY_CONTEXT ?? "/";
base = base.endsWith("/") ? base : `${base}/`;
var unslashedBase = base === "/" ? base : base.slice(0, -1);
var { plugins, ...conf } = vite_config_default;
plugins[0] = react2({
  babel: {
    plugins: [jotaiDebugLabel, jotaiReactRefresh]
  }
});
var proxyAll = {
  target: env.VITE_PROXY_TARGET,
  changeOrigin: true,
  xfwd: true,
  bypass(req, res, options) {
    if (req.url === base || req.url === base + "index.html" || req.url.startsWith(base + "src/") || req.url.startsWith(base + "@fs/") || req.url === base + "@react-refresh" || req.url.startsWith(base + "@id/") || req.url.startsWith(base + "@vite/") || req.url.startsWith(base + "node_modules/") || /\/theme\/([^.]+)\.json/.test(req.url) || req.url.startsWith(base + "js/libs/monaco-editor/vs/")) {
      return req.url;
    }
  }
};
var proxyWs = {
  target: env.VITE_PROXY_TARGET,
  changeOrigin: true,
  ws: true
};
var vite_dev_config_default = mergeConfig(
  conf,
  defineConfig2({
    plugins,
    base,
    server: {
      proxy: {
        [`${base}websocket`]: proxyWs,
        [base]: proxyAll,
        [unslashedBase]: proxyAll
      },
      fs: {
        // Allow serving files from one level up to the project root
        allow: ["..", "../../axelor-ui"]
      }
    }
  })
);
export {
  vite_dev_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS1kZXYuY29uZmlnLnRzIiwgInZpdGUuY29uZmlnLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcbmljb2xhc3ZcXFxcYXhlbG9yLW9wZW4tcGxhdGZvcm0tNy40XFxcXGF4ZWxvci1mcm9udFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcbmljb2xhc3ZcXFxcYXhlbG9yLW9wZW4tcGxhdGZvcm0tNy40XFxcXGF4ZWxvci1mcm9udFxcXFx2aXRlLWRldi5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0M6L1VzZXJzL25pY29sYXN2L2F4ZWxvci1vcGVuLXBsYXRmb3JtLTcuNC9heGVsb3ItZnJvbnQvdml0ZS1kZXYuY29uZmlnLnRzXCI7aW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdFwiO1xyXG5pbXBvcnQgam90YWlEZWJ1Z0xhYmVsIGZyb20gXCJqb3RhaS9iYWJlbC9wbHVnaW4tZGVidWctbGFiZWxcIjtcclxuaW1wb3J0IGpvdGFpUmVhY3RSZWZyZXNoIGZyb20gXCJqb3RhaS9iYWJlbC9wbHVnaW4tcmVhY3QtcmVmcmVzaFwiO1xyXG5pbXBvcnQgeyBQcm94eU9wdGlvbnMsIGxvYWRFbnYsIG1lcmdlQ29uZmlnIH0gZnJvbSBcInZpdGVcIjtcclxuaW1wb3J0IHsgVXNlckNvbmZpZywgZGVmaW5lQ29uZmlnIH0gZnJvbSBcInZpdGVzdC9jb25maWdcIjtcclxuaW1wb3J0IHZpdGVDb25maWcgZnJvbSBcIi4vdml0ZS5jb25maWdcIjtcclxuXHJcbmxldCBlbnYgPSBsb2FkRW52KFwiZGV2XCIsIHByb2Nlc3MuY3dkKCksIFwiXCIpO1xyXG5sZXQgYmFzZSA9IGVudi5WSVRFX1BST1hZX0NPTlRFWFQgPz8gXCIvXCI7XHJcblxyXG5iYXNlID0gYmFzZS5lbmRzV2l0aChcIi9cIikgPyBiYXNlIDogYCR7YmFzZX0vYDtcclxuY29uc3QgdW5zbGFzaGVkQmFzZSA9IGJhc2UgPT09IFwiL1wiID8gYmFzZSA6IGJhc2Uuc2xpY2UoMCwgLTEpO1xyXG5cclxuY29uc3QgeyBwbHVnaW5zLCAuLi5jb25mIH0gPSB2aXRlQ29uZmlnIGFzIFVzZXJDb25maWc7XHJcblxyXG4vLyByZXBsYWNlIHJlYWN0IHBsdWdpblxyXG5wbHVnaW5zWzBdID0gcmVhY3Qoe1xyXG4gIGJhYmVsOiB7XHJcbiAgICBwbHVnaW5zOiBbam90YWlEZWJ1Z0xhYmVsLCBqb3RhaVJlYWN0UmVmcmVzaF0sXHJcbiAgfSxcclxufSk7XHJcblxyXG5jb25zdCBwcm94eUFsbDogUHJveHlPcHRpb25zID0ge1xyXG4gIHRhcmdldDogZW52LlZJVEVfUFJPWFlfVEFSR0VULFxyXG4gIGNoYW5nZU9yaWdpbjogdHJ1ZSxcclxuICB4ZndkOiB0cnVlLFxyXG4gIGJ5cGFzcyhyZXEsIHJlcywgb3B0aW9ucykge1xyXG4gICAgaWYgKFxyXG4gICAgICByZXEudXJsID09PSBiYXNlIHx8XHJcbiAgICAgIHJlcS51cmwgPT09IGJhc2UgKyBcImluZGV4Lmh0bWxcIiB8fFxyXG4gICAgICByZXEudXJsLnN0YXJ0c1dpdGgoYmFzZSArIFwic3JjL1wiKSB8fFxyXG4gICAgICByZXEudXJsLnN0YXJ0c1dpdGgoYmFzZSArIFwiQGZzL1wiKSB8fFxyXG4gICAgICByZXEudXJsID09PSBiYXNlICsgXCJAcmVhY3QtcmVmcmVzaFwiIHx8XHJcbiAgICAgIHJlcS51cmwuc3RhcnRzV2l0aChiYXNlICsgXCJAaWQvXCIpIHx8XHJcbiAgICAgIHJlcS51cmwuc3RhcnRzV2l0aChiYXNlICsgXCJAdml0ZS9cIikgfHxcclxuICAgICAgcmVxLnVybC5zdGFydHNXaXRoKGJhc2UgKyBcIm5vZGVfbW9kdWxlcy9cIikgfHxcclxuICAgICAgL1xcL3RoZW1lXFwvKFteLl0rKVxcLmpzb24vLnRlc3QocmVxLnVybCkgfHxcclxuICAgICAgcmVxLnVybC5zdGFydHNXaXRoKGJhc2UgKyBcImpzL2xpYnMvbW9uYWNvLWVkaXRvci92cy9cIilcclxuICAgICkge1xyXG4gICAgICByZXR1cm4gcmVxLnVybDtcclxuICAgIH1cclxuICB9LFxyXG59O1xyXG5cclxuY29uc3QgcHJveHlXczogUHJveHlPcHRpb25zID0ge1xyXG4gIHRhcmdldDogZW52LlZJVEVfUFJPWFlfVEFSR0VULFxyXG4gIGNoYW5nZU9yaWdpbjogdHJ1ZSxcclxuICB3czogdHJ1ZSxcclxufTtcclxuXHJcbmV4cG9ydCBkZWZhdWx0IG1lcmdlQ29uZmlnKFxyXG4gIGNvbmYsXHJcbiAgZGVmaW5lQ29uZmlnKHtcclxuICAgIHBsdWdpbnMsXHJcbiAgICBiYXNlLFxyXG4gICAgc2VydmVyOiB7XHJcbiAgICAgIHByb3h5OiB7XHJcbiAgICAgICAgW2Ake2Jhc2V9d2Vic29ja2V0YF06IHByb3h5V3MsXHJcbiAgICAgICAgW2Jhc2VdOiBwcm94eUFsbCxcclxuICAgICAgICBbdW5zbGFzaGVkQmFzZV06IHByb3h5QWxsLFxyXG4gICAgICB9LFxyXG4gICAgICBmczoge1xyXG4gICAgICAgIC8vIEFsbG93IHNlcnZpbmcgZmlsZXMgZnJvbSBvbmUgbGV2ZWwgdXAgdG8gdGhlIHByb2plY3Qgcm9vdFxyXG4gICAgICAgIGFsbG93OiBbXCIuLlwiLCBcIi4uLy4uL2F4ZWxvci11aVwiXSxcclxuICAgICAgfSxcclxuICAgIH0sXHJcbiAgfSksXHJcbik7XHJcbiIsICJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcbmljb2xhc3ZcXFxcYXhlbG9yLW9wZW4tcGxhdGZvcm0tNy40XFxcXGF4ZWxvci1mcm9udFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcbmljb2xhc3ZcXFxcYXhlbG9yLW9wZW4tcGxhdGZvcm0tNy40XFxcXGF4ZWxvci1mcm9udFxcXFx2aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvbmljb2xhc3YvYXhlbG9yLW9wZW4tcGxhdGZvcm0tNy40L2F4ZWxvci1mcm9udC92aXRlLmNvbmZpZy50c1wiO2ltcG9ydCBsZWdhY3kgZnJvbSBcIkB2aXRlanMvcGx1Z2luLWxlZ2FjeVwiO1xyXG5pbXBvcnQgcmVhY3QgZnJvbSBcIkB2aXRlanMvcGx1Z2luLXJlYWN0XCI7XHJcbmltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCI7XHJcbmltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gXCJ2aXRlXCI7XHJcbmltcG9ydCBzdmdyIGZyb20gXCJ2aXRlLXBsdWdpbi1zdmdyXCI7XHJcblxyXG4vLyBodHRwczovL3ZpdGVqcy5kZXYvY29uZmlnL1xyXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xyXG4gIGJhc2U6IFwiLi9cIixcclxuICBwbHVnaW5zOiBbXHJcbiAgICByZWFjdCgpLFxyXG4gICAgc3Zncih7XHJcbiAgICAgIHN2Z3JPcHRpb25zOiB7XHJcbiAgICAgICAgaWNvbjogdHJ1ZSxcclxuICAgICAgfSxcclxuICAgIH0pLFxyXG4gICAgbGVnYWN5KHtcclxuICAgICAgbW9kZXJuUG9seWZpbGxzOiB0cnVlLFxyXG4gICAgICByZW5kZXJMZWdhY3lDaHVua3M6IGZhbHNlLFxyXG4gICAgfSksXHJcbiAgXSxcclxuICBvcHRpbWl6ZURlcHM6IHtcclxuICAgIGVudHJpZXM6IFtcInNyYy8qKi8qLnt0cyxqcyx0c3gsanN4LGNzcyxzY3NzLGh0bWx9XCJdLFxyXG4gIH0sXHJcbiAgcmVzb2x2ZToge1xyXG4gICAgYWxpYXM6IFtcclxuICAgICAge1xyXG4gICAgICAgIGZpbmQ6IC9efiguKikvLFxyXG4gICAgICAgIHJlcGxhY2VtZW50OiBcIiQxXCIsXHJcbiAgICAgIH0sXHJcbiAgICAgIHtcclxuICAgICAgICBmaW5kOiAvXkBcXC8oLiopLyxcclxuICAgICAgICByZXBsYWNlbWVudDogcGF0aC5qb2luKF9fZGlybmFtZSwgXCJzcmNcIiwgXCIkMVwiKSxcclxuICAgICAgfSxcclxuICAgIF0sXHJcbiAgfSxcclxuICBidWlsZDoge1xyXG4gICAgdGFyZ2V0OiBbXCJlczIwMjJcIl0sXHJcbiAgfSxcclxufSk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBeVcsT0FBT0EsWUFBVztBQUMzWCxPQUFPLHFCQUFxQjtBQUM1QixPQUFPLHVCQUF1QjtBQUM5QixTQUF1QixTQUFTLG1CQUFtQjtBQUNuRCxTQUFxQixnQkFBQUMscUJBQW9COzs7QUNKd1QsT0FBTyxZQUFZO0FBQ3BYLE9BQU8sV0FBVztBQUNsQixPQUFPLFVBQVU7QUFDakIsU0FBUyxvQkFBb0I7QUFDN0IsT0FBTyxVQUFVO0FBSmpCLElBQU0sbUNBQW1DO0FBT3pDLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLE1BQU07QUFBQSxFQUNOLFNBQVM7QUFBQSxJQUNQLE1BQU07QUFBQSxJQUNOLEtBQUs7QUFBQSxNQUNILGFBQWE7QUFBQSxRQUNYLE1BQU07QUFBQSxNQUNSO0FBQUEsSUFDRixDQUFDO0FBQUEsSUFDRCxPQUFPO0FBQUEsTUFDTCxpQkFBaUI7QUFBQSxNQUNqQixvQkFBb0I7QUFBQSxJQUN0QixDQUFDO0FBQUEsRUFDSDtBQUFBLEVBQ0EsY0FBYztBQUFBLElBQ1osU0FBUyxDQUFDLHdDQUF3QztBQUFBLEVBQ3BEO0FBQUEsRUFDQSxTQUFTO0FBQUEsSUFDUCxPQUFPO0FBQUEsTUFDTDtBQUFBLFFBQ0UsTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLE1BQ2Y7QUFBQSxNQUNBO0FBQUEsUUFDRSxNQUFNO0FBQUEsUUFDTixhQUFhLEtBQUssS0FBSyxrQ0FBVyxPQUFPLElBQUk7QUFBQSxNQUMvQztBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQUEsRUFDQSxPQUFPO0FBQUEsSUFDTCxRQUFRLENBQUMsUUFBUTtBQUFBLEVBQ25CO0FBQ0YsQ0FBQzs7O0FEaENELElBQUksTUFBTSxRQUFRLE9BQU8sUUFBUSxJQUFJLEdBQUcsRUFBRTtBQUMxQyxJQUFJLE9BQU8sSUFBSSxzQkFBc0I7QUFFckMsT0FBTyxLQUFLLFNBQVMsR0FBRyxJQUFJLE9BQU8sR0FBRyxJQUFJO0FBQzFDLElBQU0sZ0JBQWdCLFNBQVMsTUFBTSxPQUFPLEtBQUssTUFBTSxHQUFHLEVBQUU7QUFFNUQsSUFBTSxFQUFFLFNBQVMsR0FBRyxLQUFLLElBQUk7QUFHN0IsUUFBUSxDQUFDLElBQUlDLE9BQU07QUFBQSxFQUNqQixPQUFPO0FBQUEsSUFDTCxTQUFTLENBQUMsaUJBQWlCLGlCQUFpQjtBQUFBLEVBQzlDO0FBQ0YsQ0FBQztBQUVELElBQU0sV0FBeUI7QUFBQSxFQUM3QixRQUFRLElBQUk7QUFBQSxFQUNaLGNBQWM7QUFBQSxFQUNkLE1BQU07QUFBQSxFQUNOLE9BQU8sS0FBSyxLQUFLLFNBQVM7QUFDeEIsUUFDRSxJQUFJLFFBQVEsUUFDWixJQUFJLFFBQVEsT0FBTyxnQkFDbkIsSUFBSSxJQUFJLFdBQVcsT0FBTyxNQUFNLEtBQ2hDLElBQUksSUFBSSxXQUFXLE9BQU8sTUFBTSxLQUNoQyxJQUFJLFFBQVEsT0FBTyxvQkFDbkIsSUFBSSxJQUFJLFdBQVcsT0FBTyxNQUFNLEtBQ2hDLElBQUksSUFBSSxXQUFXLE9BQU8sUUFBUSxLQUNsQyxJQUFJLElBQUksV0FBVyxPQUFPLGVBQWUsS0FDekMseUJBQXlCLEtBQUssSUFBSSxHQUFHLEtBQ3JDLElBQUksSUFBSSxXQUFXLE9BQU8sMkJBQTJCLEdBQ3JEO0FBQ0EsYUFBTyxJQUFJO0FBQUEsSUFDYjtBQUFBLEVBQ0Y7QUFDRjtBQUVBLElBQU0sVUFBd0I7QUFBQSxFQUM1QixRQUFRLElBQUk7QUFBQSxFQUNaLGNBQWM7QUFBQSxFQUNkLElBQUk7QUFDTjtBQUVBLElBQU8sMEJBQVE7QUFBQSxFQUNiO0FBQUEsRUFDQUMsY0FBYTtBQUFBLElBQ1g7QUFBQSxJQUNBO0FBQUEsSUFDQSxRQUFRO0FBQUEsTUFDTixPQUFPO0FBQUEsUUFDTCxDQUFDLEdBQUcsSUFBSSxXQUFXLEdBQUc7QUFBQSxRQUN0QixDQUFDLElBQUksR0FBRztBQUFBLFFBQ1IsQ0FBQyxhQUFhLEdBQUc7QUFBQSxNQUNuQjtBQUFBLE1BQ0EsSUFBSTtBQUFBO0FBQUEsUUFFRixPQUFPLENBQUMsTUFBTSxpQkFBaUI7QUFBQSxNQUNqQztBQUFBLElBQ0Y7QUFBQSxFQUNGLENBQUM7QUFDSDsiLAogICJuYW1lcyI6IFsicmVhY3QiLCAiZGVmaW5lQ29uZmlnIiwgInJlYWN0IiwgImRlZmluZUNvbmZpZyJdCn0K
