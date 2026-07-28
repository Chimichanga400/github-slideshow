/**
 * BackupGuard.js — keeps a user's data safe OFF the device.
 *
 * Everything lives in browser storage; the in-app snapshots live in the SAME
 * browser, so a lost phone or cleared site-data wipes both. This guard makes
 * sure a real backup file leaves the browser regularly:
 *
 *  - Android build (native save bridge present): silently auto-saves a full
 *    backup to Downloads once a week. No nagging.
 *  - Browser / local-server: shows a dismissible banner when the last saved
 *    backup file is > 7 days old (snoozable for 3 days).
 *
 * "Fresh" is stamped by BackupVault.markFileBackup(), called wherever a full
 * backup actually reaches a file (vault download, Export-All JSON).
 */
const BackupGuard = {
  NUDGE_AFTER_DAYS: 7,
  SNOOZE_DAYS: 3,
  _SNOOZE_KEY: 'kn_backup_nudge_snooze',

  async check() {
    try {
      if (typeof nodeStore === 'undefined' || typeof BackupVault === 'undefined') return;
      const nodes = nodeStore.getAll().length;
      if (nodes === 0) return;
      const age = BackupVault.fileBackupAgeDays();
      // Never backed up: give new users grace until they have something worth saving
      if (age === Infinity && nodes < 3) return;
      if (age < this.NUDGE_AFTER_DAYS) return;

      const native = !!(window.KnowledgeNodeFiles && window.KnowledgeNodeFiles.saveToDownloads);
      if (native) {
        const rec = await BackupVault.snapshot('auto');
        BackupVault.download(rec);                       // silent native save + stamps freshness
        if (window.Toast) Toast.info('Weekly backup saved to Downloads.');
      } else {
        this._showBanner(age);
      }
    } catch (e) { console.warn('[BackupGuard]', e); }
  },

  _showBanner(age) {
    if (Date.now() < parseInt(localStorage.getItem(this._SNOOZE_KEY) || '0', 10)) return;
    if (document.getElementById('kn-backup-banner')) return;
    const host = document.getElementById('main-content') || document.body;
    const el = document.createElement('div');
    el.id = 'kn-backup-banner';
    el.style.cssText = 'margin:12px 16px;padding:12px 14px;background:var(--accent-soft);border:1px solid var(--accent-dim);border-radius:var(--radius-md);display:flex;align-items:center;gap:12px;flex-wrap:wrap;';
    const msg = age === Infinity
      ? 'Your notes only live in this browser — save a backup file somewhere safe.'
      : 'Your last saved backup file is ' + Math.floor(age) + ' days old.';
    el.innerHTML =
      '<span style="font-family:var(--font-mono);font-size:12px;color:var(--text-primary);flex:1;min-width:200px;">🛟 ' + msg + '</span>'
      + '<div style="display:flex;gap:8px;">'
      + '<button id="kn-backup-now" class="btn-primary" style="padding:8px 14px;font-size:12px;">Download backup</button>'
      + '<button id="kn-backup-later" class="btn-secondary" style="padding:8px 14px;font-size:12px;">Later</button>'
      + '</div>';
    host.prepend(el);
    document.getElementById('kn-backup-now').addEventListener('click', async () => {
      try {
        const rec = await BackupVault.snapshot('manual');
        BackupVault.download(rec);
        if (window.Toast) Toast.success('Backup saved — keep it somewhere off this device.');
      } catch (e) { if (window.Toast) Toast.error('Backup failed: ' + e.message); return; }
      el.remove();
    });
    document.getElementById('kn-backup-later').addEventListener('click', () => {
      try { localStorage.setItem(this._SNOOZE_KEY, String(Date.now() + this.SNOOZE_DAYS * 86400000)); } catch (e) {}
      el.remove();
    });
  },
};
if (typeof window !== 'undefined') window.BackupGuard = BackupGuard;
