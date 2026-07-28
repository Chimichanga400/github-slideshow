/**
 * SharePack.js — share a subject's topics with a friend as one small file.
 *
 * The pack contains study CONTENT only (notes, questions, examples, images):
 * your review history, mastery scores, and AI keys are stripped, so the
 * recipient starts fresh and nothing personal travels. The file imports
 * through the normal Settings → Import flow (nodes merge by id, and a
 * pre-import safety snapshot is taken automatically).
 */
const SharePack = {
  build(subject) {
    const all = nodeStore.getAll().filter(n => n.processingStatus !== 'processing');
    const nodes = (subject && subject !== 'all') ? all.filter(n => n.subject === subject) : all;
    if (!nodes.length) return null;
    const clean = nodes.map(n => {
      const j = n.toJSON();
      delete j.srsState;        // recipient's practice starts fresh
      delete j.masteryScore;
      delete j.lastReviewed;
      return j;
    });
    return {
      _knPack: 1,
      subject: (subject && subject !== 'all') ? subject : '',
      exportedAt: Date.now(),
      nodes: clean,
    };
  },

  share(subject) {
    const pack = this.build(subject);
    if (!pack) { if (window.Toast) Toast.error('No topics to share yet.'); return false; }
    const label = pack.subject || 'All_Topics';
    const safe = label.replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'Topics';
    const filename = 'KnowledgeNode_pack_' + safe + '.json';
    const json = JSON.stringify(pack);
    if (window.KNFiles) {
      KNFiles.save(filename, 'application/json', json);
    } else {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.style.display = 'none';
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
    }
    if (window.Toast) Toast.success(
      pack.nodes.length + ' topic' + (pack.nodes.length > 1 ? 's' : '')
      + ' packed — send the file to a friend. They import it in Settings → Import.');
    return true;
  },
};
if (typeof window !== 'undefined') window.SharePack = SharePack;
