const status = document.querySelector('#app');

try {
  const response = await fetch('./app-v11.js?v=11.1', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load quiz engine (${response.status})`);

  let source = await response.text();

  const broken = "sessionStorage.setItem(historyKey(fp),JSON.stringify([...readHistory(fp),...quiz.map(q=>q.signature)].slice(-HISTORY_LIMIT))}catch{}";
  const fixed = "sessionStorage.setItem(historyKey(fp),JSON.stringify([...readHistory(fp),...quiz.map(q=>q.signature)].slice(-HISTORY_LIMIT)))}catch{}";

  if (source.includes(broken)) {
    source = source.replace(broken, fixed);
  }

  const blob = new Blob([source], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);

  try {
    await import(url);
  } finally {
    URL.revokeObjectURL(url);
  }
} catch (error) {
  console.error('PageQuiz failed to start:', error);
  if (status) {
    status.innerHTML = `
      <section class="card" style="margin:40px auto;max-width:720px">
        <h1>PageQuiz could not start</h1>
        <p class="sub">A script failed to load. Please refresh once. If this message remains, send the console error.</p>
        <div class="error">${String(error?.message || error)}</div>
      </section>`;
  }
}
