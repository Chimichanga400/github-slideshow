/**
 * BackNav.js — drives the phone/browser back button through KNNav.
 *
 * A sentinel history entry sits under the app. Pressing back pops it and we
 * ask KNNav.back() to close the top-most thing: a registered overlay (modals,
 * More sheet), any [data-kn-overlay] element (tutor, learn panel, bulk
 * import, guide, onboarding…), or step back a view (node detail → library).
 * Handled → re-arm the sentinel; nothing ours → let the browser leave.
 *
 * ⚠ The sentinel must be pushed DURING a user gesture: Chrome/Samsung
 * Internet skip history entries created without user activation ("history
 * manipulation intervention"), so a load-time pushState is ignored by the
 * phone's back button. We arm on the first touch/keypress instead, and
 * re-arm inside the popstate handler (a back press IS a user gesture).
 */
const BackNav = {
  _armed: false,

  init() {
    const arm = () => this._arm();
    document.addEventListener('pointerdown', arm, { passive: true, capture: true });
    document.addEventListener('touchstart',  arm, { passive: true, capture: true });
    document.addEventListener('keydown',     arm, true);

    window.addEventListener('popstate', () => {
      this._armed = false;
      let handled = false;
      try { handled = (typeof KNNav !== 'undefined') && KNNav.back(); } catch (e) {}
      if (handled) this._arm();                      // back press = user gesture
      else { try { history.back(); } catch (e) {} }  // nothing ours — really go back
    });
  },

  _arm() {
    if (this._armed) return;
    this._armed = true;
    try { history.pushState({ knSentinel: true }, ''); } catch (e) { this._armed = false; }
  },
};
if (typeof window !== 'undefined') { window.BackNav = BackNav; BackNav.init(); }
