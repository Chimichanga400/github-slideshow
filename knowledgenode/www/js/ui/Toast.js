/**
 * Toast.js — Notification System
 */

const Toast = {
  _container: null,

  _getContainer() {
    if (!this._container) {
      this._container = document.getElementById('toast-container');
    }
    return this._container;
  },

  show(message, type = 'info', duration = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = { success: '✓', error: '✕', info: 'ℹ', warn: '⚠' };
    toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span class="toast-msg">${message}</span><button class="toast-close" aria-label="Dismiss">✕</button>`;

    this._getContainer().appendChild(toast);

    let timer;
    const dismiss = () => {
      clearTimeout(timer);
      toast.classList.add('toast-out');
      setTimeout(() => toast.remove(), 300);
    };
    toast.querySelector('.toast-close').addEventListener('click', dismiss);
    timer = setTimeout(dismiss, duration);
  },

  success(msg) { this.show(msg, 'success'); },
  error(msg)   { this.show(msg, 'error', 6000); },
  info(msg, duration)    { this.show(msg, 'info', duration); },
  warn(msg)    { this.show(msg, 'warn', 6000); },
};
