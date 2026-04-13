// NOTE: Use require() instead of import so Metro does NOT hoist it.
// The global handler must be installed BEFORE expo-router evaluates any module.

// ─── Global JS crash guard ────────────────────────────────────────────────────
// Catches unhandled fatal JS errors that occur before React even mounts
// (e.g. module evaluation errors, native-module boot failures surfaced in JS).
// On the NEXT launch, _layout.tsx reads the stored entry and shows a crash report.
(function installCrashGuard() {
	try {
		var prevHandler = global.ErrorUtils && global.ErrorUtils.getGlobalHandler
			? global.ErrorUtils.getGlobalHandler()
			: null;

		if (global.ErrorUtils && global.ErrorUtils.setGlobalHandler) {
			global.ErrorUtils.setGlobalHandler(function (error, isFatal) {
				try {
					var AS = require('@react-native-async-storage/async-storage').default;
					var entry = JSON.stringify({
						timestamp: new Date().toISOString(),
						message: (error && error.message) ? error.message : String(error || 'Unknown error'),
						stack:   (error && error.stack)   ? error.stack   : '',
						isFatal: Boolean(isFatal),
						source:  'global-handler',
					});
					// Fire-and-forget — process may die before this resolves, but it
					// succeeds in the vast majority of soft-crash scenarios.
					AS.setItem('nexora_crash_log_v1', entry).catch(function () {});
				} catch (_) {}

				// Always delegate to the original handler so RN's red-box / dev tools
				// still work and the process terminates as expected.
				if (typeof prevHandler === 'function') prevHandler(error, isFatal);
			});
		}
	} catch (_) {}
})();

require('expo-router/entry');
