import { calculateBloodTiesPoints } from './blood-ties-core.js?v=20261021-6';
import { createRng, hashString, shuffle } from './game-core.js';

const html = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

export function renderBloodTiesView({ app, puzzle, session, official, developer, heading, resultActions = '', nextRound = '', onSave, onSubmit, onSound }) {
  const remaining = puzzle.tiles.filter((tile) => !puzzle.groups.some((g) => session.solved.includes(g.id) && g.answers.includes(tile)));
  const tiles = shuffle(remaining, createRng(hashString(`${puzzle.key}:shuffle:${session.shuffleCount}`)));
  const groupRow = (group, index, revealed = false) => `<article class="blood-group blood-colour-${index}${revealed ? ' is-revealed' : ''}">
    <span class="blood-group-label">${revealed ? 'Revealed' : 'Connection found'}</span>
    <h3>${html(group.name)}</h3><p>${group.answers.map(html).join(' · ')}</p>
    <details><summary>Why these belong together</summary><p>${html(group.definition)}</p></details></article>`;
  const solvedGroups = session.solved.map((id) => puzzle.groups.find((g) => g.id === id));
  const resultTitle = official ? session.success ? 'Round Survived!' : 'Run ended' : session.success ? 'Puzzle Complete!' : 'Not quite';
  app.innerHTML = `<section class="panel blood-puzzle-panel${session.complete ? ' blood-result-panel' : ''}">
    ${session.complete ? `<div class="result-banner ${session.success ? 'correct' : 'failed'} animate"><p class="kicker">Blood Ties${official ? ' · Today’s round' : ' · Just for fun'}</p><h2>${resultTitle}</h2>
      <p>${session.success ? `You found three connections with ${session.misses === 0 ? 'no mistakes' : `${session.misses} ${session.misses === 1 ? 'mistake' : 'mistakes'}`}. The final group is revealed.` : `You found ${session.solved.length} of four connections. All the answers are revealed below.`}
      ${official ? session.success ? '' : ' Your permanent Score and Solves are safe.' : ' This result did not affect your stats.'}</p>
      ${official && session.success ? `<div class="result-score-total"><span>Round score</span><strong data-count-to="${session.points}">${session.points}</strong></div>` : ''}
      ${official && !session.success ? `<p class="survival-summary">Your next game starts at <strong>Round 1</strong>.</p>` : ''}</div>`
      : `<img class="puzzle-panel-art" src="./assets/blood-ties-card.svg?v=20261021-6" alt="" width="240" height="240" aria-hidden="true">
      ${heading('Blood Ties', 'Find three tiles with a shared connection. Four groups. Three chances.', official ? 'Today’s round' : 'Just for fun', true)}
      <div class="word-scoreboard${official ? '' : ' is-single'}"><div class="blood-attempts"><span>Mistakes remaining</span><strong>${3 - session.misses} / 3</strong><div class="blood-life-meter" aria-hidden="true">${[0, 1, 2].map((i) => `<i class="${i < 3 - session.misses ? 'is-active' : ''}"></i>`).join('')}</div></div>
      ${official ? `<div><span>Potential score</span><strong>${calculateBloodTiesPoints(session.misses)}</strong></div>` : ''}</div>
      <p class="blood-instruction">Select exactly <strong>3 tiles</strong>. Some fit more than one connection.</p>`}
    <div class="blood-solved" aria-label="${session.complete ? 'Today’s connections' : 'Solved connections'}">${session.complete
      ? puzzle.groups.map((g, i) => groupRow(g, i, !session.solved.includes(g.id) || session.success && g.id === session.solved.at(-1))).join('')
      : solvedGroups.map((g) => groupRow(g, puzzle.groups.indexOf(g))).join('')}</div>
    ${session.complete ? resultActions : `<div class="blood-grid" role="group" aria-label="Connection tiles">${tiles.map((tile, i) => `<button class="blood-tile${session.selected.includes(tile) ? ' is-selected' : ''}" type="button" data-blood-tile="${i}" aria-pressed="${session.selected.includes(tile)}">${html(tile)}</button>`).join('')}</div>
      <p id="blood-status" class="blood-status" role="status" aria-live="polite">${html(session.message || 'Find the first connection.')}</p>
      <div class="blood-controls"><button class="button" id="blood-shuffle" type="button">Shuffle</button><button class="button" id="blood-clear" type="button" ${session.selected.length ? '' : 'disabled'}>Deselect</button><button class="button primary" id="blood-submit" type="button" ${session.selected.length === 3 ? '' : 'disabled'}>Submit <span id="blood-selection-count">${session.selected.length}/3</span></button></div>
      <p class="helper-text blood-progress">${session.solved.length} / 4 connections found · The final group reveals after three solves.</p>`}
    ${developer ? `<details class="blood-dev"><summary>Developer · inspect answers</summary><p>UTC ${html(puzzle.dateKey)} · ${html(puzzle.key)}</p>${puzzle.groups.map((g) => `<p><strong>${html(g.id)} · ${html(g.name)}</strong><br>${g.answers.map(html).join(' · ')}</p>`).join('')}<p>Overlap traps: ${puzzle.redHerrings.map(html).join(', ')}</p><p>Use Advance a day in the footer to test the three-game rotation. Preview dates have separate progress and do not upload results.</p></details>` : ''}
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
    if (session.selected.includes(tile)) session.selected = session.selected.filter((t) => t !== tile);
    else if (session.selected.length < 3) { session.selected.push(tile); onSound('map-select'); }
    else { app.querySelector('#blood-status').textContent = 'Three selected. Deselect a tile to change your guess.'; return; }
    updateSelection();
  }));
  app.querySelector('#blood-clear')?.addEventListener('click', () => { session.selected = []; updateSelection(); });
  app.querySelector('#blood-shuffle')?.addEventListener('click', () => { session.shuffleCount++; onSave(true); app.querySelector('#blood-shuffle')?.focus({ preventScroll: true }); });
  app.querySelector('#blood-submit')?.addEventListener('click', onSubmit);
}
