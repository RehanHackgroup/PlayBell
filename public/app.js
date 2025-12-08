window.addEventListener("DOMContentLoaded", () => {
  const audio = document.getElementById("audioPlayer");
  const playButtons = document.querySelectorAll(".play-btn");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const playPauseBtn = document.getElementById("playPauseBtn");
  const nowPlayingText = document.getElementById("nowPlayingText");

  // Agar yeh elements hi nahi milte (login/admin page) to kuch mat karo
  if (!audio || !playPauseBtn) {
    return;
  }

  const songButtons = Array.from(playButtons);
  let currentIndex = -1;

  function getSongData(index) {
    const btn = songButtons[index];
    if (!btn) return null;

    const item = btn.closest(".song-item");
    const titleEl = item ? item.querySelector("strong") : null;
    const artistEl = item ? item.querySelector("span") : null;

    return {
      btn,
      url: btn.getAttribute("data-url"),
      title: titleEl ? titleEl.textContent : "Unknown title",
      artist: artistEl ? artistEl.textContent : "Unknown artist",
    };
  }

  function startSong(index) {
    const data = getSongData(index);
    if (!data || !data.url) return;

    currentIndex = index;
    audio.src = data.url;

    audio
      .play()
      .then(() => {
        if (nowPlayingText) {
          nowPlayingText.textContent = `${data.title} — ${data.artist}`;
        }
      })
      .catch((err) => {
        console.error("Audio play error:", err);
      });
  }

  // Har list wale "Play" button ke liye
  songButtons.forEach((btn, index) => {
    btn.addEventListener("click", () => {
      startSong(index);
    });
  });

  // Prev button
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (songButtons.length === 0) return;

      if (currentIndex === -1) {
        startSong(0);
        return;
      }

      const newIndex =
        currentIndex - 1 < 0 ? songButtons.length - 1 : currentIndex - 1;
      startSong(newIndex);
    });
  }

  // Next button
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (songButtons.length === 0) return;

      if (currentIndex === -1) {
        startSong(0);
        return;
      }

      const newIndex =
        currentIndex + 1 >= songButtons.length ? 0 : currentIndex + 1;
      startSong(newIndex);
    });
  }

  // Main Play / Pause button
  if (playPauseBtn) {
    playPauseBtn.addEventListener("click", () => {
      // Agar koi gaana set hi nahi hai to pehla gaana chalu kar
      if (!audio.src || audio.src === "") {
        if (songButtons.length > 0) {
          startSong(0);
        }
        return;
      }

      if (audio.paused) {
        audio.play().catch((err) => console.error(err));
      } else {
        audio.pause();
      }
    });
  }

  // Button text audio state ke hisaab se change
  audio.addEventListener("play", () => {
    if (playPauseBtn) {
      playPauseBtn.textContent = "⏸ Pause";
    }
  });

  audio.addEventListener("pause", () => {
    if (playPauseBtn) {
      playPauseBtn.textContent = "▶️ Play";
    }
  });
});
