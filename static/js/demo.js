function initDemo(config) {
  'use strict';

  const SEGMENTS_DIR = config.segmentsDir;
  const suffix = config.suffix || '';

  const SPEAKER_COLORS = [
    '#3273dc', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6',
    '#1abc9c', '#e67e22', '#2980b9', '#c0392b', '#27ae60',
    '#8e44ad', '#16a085', '#d35400', '#2c3e50', '#f1c40f',
    '#e91e63', '#00bcd4', '#ff5722', '#607d8b', '#795548',
    '#4caf50', '#ff9800', '#03a9f4', '#673ab7', '#009688',
    '#ff6f00', '#5c6bc0', '#ef5350', '#66bb6a', '#ab47bc'
  ];

  let data = config.data;
  let totalDuration = data.metadata.audio_duration_seconds;
  let speakerMap = {};
  let speakerOrder = [];
  let activeSegmentIdx = null;
  let segmentAudio = null;

  function $(id) { return document.getElementById(id + suffix); }

  buildSpeakerMap();
  renderTimeline();
  renderTranscript();
  renderStats();
  initOriginalPlayer();

  function buildSpeakerMap() {
    const speakers = new Set();
    data.segments.forEach(s => speakers.add(s.speaker));
    speakerOrder = Array.from(speakers).sort((a, b) => {
      const na = parseInt(a.replace('SPEAKER_', ''));
      const nb = parseInt(b.replace('SPEAKER_', ''));
      return na - nb;
    });
    speakerOrder.forEach((spk, i) => {
      speakerMap[spk] = {
        color: SPEAKER_COLORS[i % SPEAKER_COLORS.length],
        index: i,
        label: 'S' + parseInt(spk.replace('SPEAKER_', ''))
      };
    });
  }

  function fmtTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function fmtTimeFull(sec) {
    const m = Math.floor(sec / 60);
    const s = (sec % 60).toFixed(1);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(5, '0');
  }

  function segFilename(idx, speaker) {
    return String(idx).padStart(5, '0') + '_' + speaker + '.mp3';
  }

  function initOriginalPlayer() {
    const audio = $('original-audio');
    const playBtn = $('original-play-btn');
    const timeDisplay = $('original-time');
    const progressWrap = $('original-progress-wrap');
    const progressBar = $('original-progress-bar');
    const progressCursor = $('original-progress-cursor');
    const speedBtn = $('speed-btn');
    const speeds = [1, 1.25, 1.5, 2, 0.75];
    let speedIdx = 0;

    audio.addEventListener('loadedmetadata', () => {
      timeDisplay.textContent = fmtTime(0) + ' / ' + fmtTime(audio.duration);
    });

    playBtn.addEventListener('click', () => {
      if (audio.paused) {
        audio.play();
        playBtn.innerHTML = '<span class="icon"><i class="fas fa-pause"></i></span>';
      } else {
        audio.pause();
        playBtn.innerHTML = '<span class="icon"><i class="fas fa-play"></i></span>';
      }
    });

    speedBtn.addEventListener('click', () => {
      speedIdx = (speedIdx + 1) % speeds.length;
      audio.playbackRate = speeds[speedIdx];
      speedBtn.textContent = speeds[speedIdx] + 'x';
    });

    audio.addEventListener('timeupdate', () => {
      const pct = (audio.currentTime / audio.duration) * 100;
      progressBar.style.width = pct + '%';
      progressCursor.style.left = pct + '%';
      timeDisplay.textContent = fmtTime(audio.currentTime) + ' / ' + fmtTime(audio.duration);
      updateTimelinePlayhead(audio.currentTime);
      highlightCurrentTranscript(audio.currentTime);
    });

    audio.addEventListener('ended', () => {
      playBtn.innerHTML = '<span class="icon"><i class="fas fa-play"></i></span>';
    });

    progressWrap.addEventListener('click', (e) => {
      const rect = progressWrap.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      audio.currentTime = pct * audio.duration;
    });
  }

  function renderTimeline() {
    const container = $('timeline-container');
    const legend = $('speaker-legend');

    speakerOrder.forEach(spk => {
      const info = speakerMap[spk];
      const count = data.segments.filter(s => s.speaker === spk).length;
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.style.background = info.color + '18';
      item.innerHTML = '<div class="legend-color" style="background:' + info.color + '"></div>' +
                        '<span>' + spk + ' (' + count + ')</span>';
      legend.appendChild(item);
    });

    const axisDiv = document.createElement('div');
    axisDiv.className = 'timeline-time-axis';
    const tickInterval = totalDuration > 600 ? 120 : 60;
    for (let t = 0; t <= totalDuration; t += tickInterval) {
      const tick = document.createElement('div');
      tick.className = 'timeline-time-tick';
      tick.style.left = (t / totalDuration * 100) + '%';
      tick.textContent = fmtTime(t);
      axisDiv.appendChild(tick);
    }
    container.appendChild(axisDiv);

    speakerOrder.forEach(spk => {
      const info = speakerMap[spk];
      const row = document.createElement('div');
      row.className = 'timeline-row';

      const label = document.createElement('div');
      label.className = 'timeline-row-label';
      label.textContent = info.label;
      label.style.color = info.color;
      row.appendChild(label);

      const track = document.createElement('div');
      track.className = 'timeline-track';

      const playhead = document.createElement('div');
      playhead.className = 'timeline-playhead';
      playhead.dataset.speaker = spk;
      track.appendChild(playhead);

      data.segments.forEach((seg, idx) => {
        if (seg.speaker !== spk) return;
        const left = (seg.start / totalDuration) * 100;
        const width = ((seg.end - seg.start) / totalDuration) * 100;
        const el = document.createElement('div');
        el.className = 'timeline-segment';
        el.style.left = left + '%';
        el.style.width = Math.max(width, 0.15) + '%';
        el.style.background = info.color;
        el.dataset.idx = idx;
        el.title = spk + ' [' + fmtTimeFull(seg.start) + ' - ' + fmtTimeFull(seg.end) + ']\n' +
                   seg.text.substring(0, 80) + (seg.text.length > 80 ? '...' : '');
        el.addEventListener('click', () => selectSegment(idx));
        track.appendChild(el);
      });

      row.appendChild(track);
      container.appendChild(row);
    });
  }

  function updateTimelinePlayhead(currentTime) {
    const pct = (currentTime / totalDuration) * 100;
    $('timeline-container').querySelectorAll('.timeline-playhead').forEach(ph => {
      ph.style.left = pct + '%';
      ph.style.display = 'block';
    });
  }

  function renderTranscript() {
    const container = $('transcript-container');
    const countTag = $('segment-count-tag');
    countTag.textContent = data.segments.length + ' segments';

    data.segments.forEach((seg, idx) => {
      const info = speakerMap[seg.speaker];
      const entry = document.createElement('div');
      entry.className = 'transcript-entry';
      entry.dataset.idx = idx;
      entry.dataset.start = seg.start;
      entry.dataset.end = seg.end;

      const avatar = document.createElement('div');
      avatar.className = 'transcript-speaker';
      avatar.style.background = info.color;
      avatar.textContent = info.label;

      const content = document.createElement('div');
      content.className = 'transcript-content';

      const time = document.createElement('div');
      time.className = 'transcript-time';
      time.textContent = fmtTimeFull(seg.start) + ' - ' + fmtTimeFull(seg.end);

      const text = document.createElement('div');
      text.className = 'transcript-text';
      text.textContent = seg.text;

      content.appendChild(time);
      content.appendChild(text);
      entry.appendChild(avatar);
      entry.appendChild(content);

      entry.addEventListener('click', () => selectSegment(idx));
      container.appendChild(entry);
    });
  }

  function highlightCurrentTranscript(currentTime) {
    if (activeSegmentIdx !== null) return;

    const entries = $('transcript-container').querySelectorAll('.transcript-entry');
    let found = false;
    entries.forEach(e => {
      const start = parseFloat(e.dataset.start);
      const end = parseFloat(e.dataset.end);
      if (!found && currentTime >= start && currentTime < end) {
        if (!e.classList.contains('active')) {
          e.classList.add('active');
          const box = $('transcript-box');
          const eTop = e.offsetTop - box.offsetTop;
          const eBot = eTop + e.offsetHeight;
          const scrollTop = box.scrollTop;
          const boxH = box.clientHeight;
          if (eTop < scrollTop || eBot > scrollTop + boxH) {
            box.scrollTop = eTop - boxH / 3;
          }
        }
        found = true;
      } else {
        e.classList.remove('active');
      }
    });

    $('timeline-container').querySelectorAll('.timeline-segment').forEach(el => {
      const idx = parseInt(el.dataset.idx);
      const seg = data.segments[idx];
      if (currentTime >= seg.start && currentTime < seg.end) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
  }

  function selectSegment(idx) {
    activeSegmentIdx = idx;
    const seg = data.segments[idx];
    const info = speakerMap[seg.speaker];
    const filename = seg.audio_file || segFilename(idx, seg.speaker);
    const audioUrl = SEGMENTS_DIR + '/' + filename;

    const container = $('segment-player-info');
    container.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'seg-detail-header';
    const badge = document.createElement('span');
    badge.className = 'seg-speaker-badge';
    badge.style.background = info.color;
    badge.textContent = seg.speaker;
    const timeRange = document.createElement('span');
    timeRange.className = 'seg-time-range';
    timeRange.textContent = fmtTimeFull(seg.start) + ' \u2192 ' + fmtTimeFull(seg.end) +
                            ' (' + (seg.end - seg.start).toFixed(1) + 's)';
    header.appendChild(badge);
    header.appendChild(timeRange);
    container.appendChild(header);

    if (segmentAudio) {
      segmentAudio.pause();
      segmentAudio = null;
    }
    const audioEl = document.createElement('audio');
    audioEl.className = 'seg-audio-player';
    audioEl.controls = true;
    audioEl.src = audioUrl;
    audioEl.autoplay = true;
    audioEl.addEventListener('ended', () => { activeSegmentIdx = null; });
    audioEl.addEventListener('pause', () => { activeSegmentIdx = null; });
    segmentAudio = audioEl;
    container.appendChild(audioEl);

    const textDiv = document.createElement('div');
    textDiv.className = 'seg-text';
    textDiv.style.borderLeftColor = info.color;
    textDiv.textContent = seg.text;
    container.appendChild(textDiv);

    const meta = document.createElement('div');
    meta.className = 'seg-meta';
    const tags = [];
    tags.push('Lang: ' + seg.language);
    if (seg.demucs) tags.push('Demucs');
    if (seg.sepreformer) tags.push('SepReformer');
    if (seg.is_separated) tags.push('Separated');
    tags.push('Segment #' + idx);
    meta.innerHTML = tags.map(t => '<span class="tag is-light is-small" style="margin-right:4px;">' + t + '</span>').join('');
    container.appendChild(meta);

    if (seg.text_whisper || seg.text_parakeet || seg.text_canary) {
      const altDiv = document.createElement('div');
      altDiv.style.marginTop = '0.75rem';
      altDiv.innerHTML = '<p style="font-size:0.75rem;font-weight:600;color:#888;margin-bottom:4px;">Alternative Transcriptions:</p>';

      const alts = [
        { label: 'Whisper', text: seg.text_whisper },
        { label: 'Parakeet', text: seg.text_parakeet },
        { label: 'Canary', text: seg.text_canary }
      ];
      alts.forEach(a => {
        if (!a.text) return;
        const p = document.createElement('div');
        p.style.cssText = 'font-size:0.78rem;color:#666;margin-bottom:3px;padding:4px 6px;background:#f9f9f9;border-radius:4px;';
        p.innerHTML = '<strong style="color:#999;">' + a.label + ':</strong> ' + a.text;
        altDiv.appendChild(p);
      });
      container.appendChild(altDiv);
    }

    $('transcript-container').querySelectorAll('.transcript-entry').forEach(e => {
      e.classList.toggle('active', parseInt(e.dataset.idx) === idx);
    });

    const targetEntry = $('transcript-container').querySelector('.transcript-entry[data-idx="' + idx + '"]');
    if (targetEntry) {
      const box = $('transcript-box');
      box.scrollTop = targetEntry.offsetTop - box.offsetTop - box.clientHeight / 3;
    }

    const origAudio = $('original-audio');
    origAudio.currentTime = seg.start;
  }

  function renderStats() {
    const container = $('stats-container');
    const meta = data.metadata;

    const stats = [
      { value: fmtTime(meta.audio_duration_seconds), label: 'Audio Duration' },
      { value: meta.total_segments, label: 'Total Segments' },
      { value: speakerOrder.length, label: 'Speakers Detected' },
      { value: meta.vad_sortformer.rt_factor.toFixed(4), label: 'VAD RTF' },
      { value: meta.whisper_large_v3.rt_factor.toFixed(4), label: 'ASR RTF' }
    ];

    stats.forEach(s => {
      const card = document.createElement('div');
      card.className = 'stat-card';
      card.innerHTML = '<div class="stat-value">' + s.value + '</div>' +
                       '<div class="stat-label">' + s.label + '</div>';
      container.appendChild(card);
    });
  }
}

document.addEventListener('DOMContentLoaded', function() {
  if (typeof DEMO_DATA !== 'undefined') {
    initDemo({
      data: DEMO_DATA,
      segmentsDir: './static/audios/test1/_final/-sepreformer-True-demucs-True-vad-True-diaModel-dia3-initPrompt-False-merge_gap-2.0-seg_th-0.11-cl_min-11-cl-th-0.5-LLM-case_0/Dr_Beth_Harris_and_Dr_Steven_Zucker_of_Smarthistory/Dr_Beth_Harris_and_Dr_Steven_Zucker_of_Smarthistory',
      suffix: ''
    });
  }
  if (typeof DEMO_DATA2 !== 'undefined') {
    initDemo({
      data: DEMO_DATA2,
      segmentsDir: './static/audios/test2/test_english_with_overlap_2min/test_english_with_overlap_2min',
      suffix: '-2'
    });
  }
});
