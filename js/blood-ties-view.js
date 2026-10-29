import { createRng, hashString, shuffle } from './game-core.js';

const html = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

export function renderBloodTiesGroup(group, index, revealed = false) {
  return `<article class="blood-group${revealed ? ' is-revealed' : ''}">
    <span class="blood-group-mark" aria-label="Connection ${index + 1} · ${revealed ? 'Revealed' : 'Found'}"><span aria-hidden="true">${revealed ? '—' : '✓'}</span></span>
    <div class="blood-group-copy"><h3>${html(group.name)}</h3><p>${group.answers.map(html).join(' · ')}</p></div>
    <details><summary aria-label="About this connection"><span aria-hidden="true">i</span></summary><p>${html(group.definition)}</p></details></article>`;
}

export function renderBloodTiesView({ app, puzzle, session, official, developer, heading, flashStrikes = false, resultActions = '', nextRound = '', onSave, onSubmit, onSound }) {
  const remaining = puzzle.tiles.filter((tile) => !puzzle.groups.some((g) => session.solved.includes(g.id) && g.answers.includes(tile)));
  const tiles = shuffle(remaining, createRng(hashString(`${puzzle.key}:shuffle:${session.shuffleCount}`)));
  const groupRow = renderBloodTiesGroup;
  const solvedGroups = session.solved.map((id) => puzzle.groups.find((g) => g.id === id));
  const displayedGroups = session.complete
    ? [...solvedGroups, ...puzzle.groups.filter((g) => !session.solved.includes(g.id))]
    : solvedGroups;
  const lastAttempt = session.attempts.at(-1);
  const lastCorrect = lastAttempt && puzzle.groups.some((g) => lastAttempt.every((tile) => g.answers.includes(tile)));
  const feedback = session.message && lastAttempt ? lastCorrect ? ' is-correct' : ' is-miss' : '';
  const resultTitle = official ? session.success ? 'Round Survived!' : 'Run ended' : session.success ? 'Puzzle Complete!' : 'Not quite';
  app.innerHTML = `<section class="panel blood-puzzle-panel${session.complete ? ' blood-result-panel' : ''}">
    ${session.complete ? `<div class="result-banner ${session.success ? 'correct' : 'failed'} animate"><h2>${resultTitle}</h2>
      <p>${session.success ? `You found ${session.rulesVersion < 3 ? 'three' : 'all four'} connections with ${session.misses === 0 ? 'no incorrect submissions' : `${session.misses} incorrect ${session.misses === 1 ? 'submission' : 'submissions'}`}.${session.rulesVersion < 3 ? ' The final connection was revealed automatically.' : ''}` : `You found ${session.solved.length} of four connections before three strikes. All four connections are shown below.`}
      ${official ? session.success ? '' : ' Your permanent Score and Solves are safe.' : ' This result did not affect your stats.'}</p>
      ${official && session.success ? `<div class="result-score-total"><span>Round score</span><strong data-count-to="${session.points}">${session.points}</strong></div>` : ''}
      ${official && !session.success ? `<p class="survival-summary">${Math.max(1, session.roundsSurvivedBeforeLoss || 1) === 1 ? 'Your Round remains at <strong>Round 1</strong>.' : `Your run ended at <strong>Round ${session.roundsSurvivedBeforeLoss}</strong>. Your next game starts at <strong>Round 1</strong>.`}</p>` : ''}</div>`
      : `<img class="puzzle-panel-art" src="./assets/blood-ties-card.svg?v=20261029-6" alt="" width="240" height="240" aria-hidden="true">
      ${heading('Blood Ties', 'Select 3 tiles that share a hidden Zombies connection. Find all four, and watch out for overlapping themes.', official ? 'Today’s round' : 'Just for fun', true)}
      ${official ? '' : '<p class="puzzle-mode-note">Playing just for fun. This result will not change your stats.</p>'}
      <div class="word-scoreboard${official ? '' : ' is-single'}" role="group" aria-label="Connection puzzle progress"><div class="blood-strikes"><span>Strikes</span><div class="blood-strike-circles${flashStrikes ? ' is-clearing' : ''}" role="img" aria-label="${session.strikes} of 3 strikes">${[1, 2, 3].map((i) => `<i class="${i <= session.strikes ? 'is-active' : ''}"></i>`).join('')}</div></div>
      ${official ? `<div><span>Potential score</span><strong>${session.potentialPoints}</strong></div>` : ''}</div>
      <div class="blood-progress" role="status" aria-label="${session.solved.length} of 4 connections found"><div class="blood-progress-copy"><strong>${session.solved.length}<span> / 4</span></strong><span>Connections found</span></div><div class="blood-progress-track" aria-hidden="true">${[1, 2, 3, 4].map(i => `<span class="${i <= session.solved.length ? 'is-found' : ''}">${i <= session.solved.length ? '✓' : i}</span>`).join('')}</div></div>`}
    <div class="blood-solved" aria-label="${session.complete ? 'Today’s connections' : 'Solved connections'}">${displayedGroups.map((g, i) => groupRow(g, i, !session.solved.includes(g.id) || session.success && session.rulesVersion < 3 && g.id === session.solved.at(-1))).join('')}</div>
    ${session.complete ? resultActions : `<div class="blood-grid" role="group" aria-label="Connection tiles">${tiles.map((tile, i) => `<button class="blood-tile${session.selected.includes(tile) ? ' is-selected' : ''}" style="--blood-longest-word:${Math.max(10, ...tile.split(/[\s-]/u).map(word => [...word].length))}" type="button" data-blood-tile="${i}" aria-pressed="${session.selected.includes(tile)}">${html(tile)}</button>`).join('')}</div>
      <p id="blood-status" class="blood-status${feedback}" role="status" aria-live="polite">${html(session.message || 'Find the first connection.')}</p>
      <div class="blood-controls"><button class="button" id="blood-shuffle" type="button">Shuffle</button><button class="button" id="blood-clear" type="button" ${session.selected.length ? '' : 'disabled'}>Deselect</button><button class="button primary" id="blood-submit" type="button" ${session.selected.length === 3 ? '' : 'disabled'}>Submit <span id="blood-selection-count">${session.selected.length}/3</span></button></div>
      `}
    ${developer ? `<details class="blood-dev"><summary>Developer · inspect answers</summary><p>UTC ${html(puzzle.dateKey)} · ${html(puzzle.key)}</p>${puzzle.groups.map((g) => `<p><strong>${html(g.id)} · ${html(g.name)}</strong><br>${g.answers.map(html).join(' · ')}</p>`).join('')}<p>Overlap traps: ${puzzle.redHerrings.map(html).join(', ')}</p><p>Use Advance a day in the footer to preview the daily game schedule. Preview dates have separate progress and do not upload results.</p></details>` : ''}
  </section>${session.complete ? nextRound : ''}`;
  function updateSelection() {
    app.querySelectorAll('[data-blood-tile]').forEach((button) => {
      const selected = session.selected.includes(tiles[Number(button.dataset.bloodTile)]);
      button.setAttribute('aria-pressed', String(selected)); button.classList.toggle('is-selected', selected);
    });
    app.querySelector('#blood-submit').disabled = session.selected.length !== 3;
    app.querySelector('#blood-clear').disabled = !session.selected.length;
    app.querySelector('#blood-selection-count').textContent = `${session.selected.length}/3`;
    onSave();
  }
  app.querySelectorAll('[data-blood-tile]').forEach((button) => button.addEventListener('click', () => {
    const tile = tiles[Number(button.dataset.bloodTile)];
    if (session.selected.includes(tile)) { session.selected = session.selected.filter((t) => t !== tile); onSound('map-select'); }
    else if (session.selected.length < 3) { session.selected.push(tile); onSound('map-select'); }
    else { app.querySelector('#blood-status').textContent = 'Three selected. Deselect a tile to change your guess.'; return; }
    updateSelection();
  }));
  app.querySelector('#blood-clear')?.addEventListener('click', () => { session.selected = []; updateSelection(); });
  app.querySelector('#blood-shuffle')?.addEventListener('click', () => { session.shuffleCount++; onSave(true); app.querySelector('#blood-shuffle')?.focus({ preventScroll: true }); });
  app.querySelector('#blood-submit')?.addEventListener('click', onSubmit);
}
