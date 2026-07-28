/**
 * Modal.js — Properly wired modal with optional onClose cleanup hook
 */
const Modal = {
  _onClose: null,
  _knBackId: null,
  open(html, onClose) {
    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-content');
    content.innerHTML = html;
    overlay.classList.remove('hidden');
    this._onClose = (typeof onClose === 'function') ? onClose : null;
    // Phone back button closes the modal (one registration even if content is replaced)
    if (!this._knBackId && typeof KNNav !== 'undefined')
      this._knBackId = KNNav.register(() => this.close());
  },
  close() {
    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-content');
    overlay.classList.add('hidden');
    content.innerHTML = '';
    const cb = this._onClose;
    this._onClose = null;
    if (this._knBackId && typeof KNNav !== 'undefined') {
      KNNav.unregister(this._knBackId);
      this._knBackId = null;
    }
    if (cb) { try { cb(); } catch (e) { /* ignore cleanup errors */ } }
  },
};
