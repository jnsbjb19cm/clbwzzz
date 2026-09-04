import {
  DEFAULT_SUMMON,
  SFX_TIER_VOLUME,
  resolveAttackSound,
  resolveAttackStartSound,
  resolveDeathSound,
  resolveDeploySound,
  resolveExtraAttackSound,
  resolveMoveSound,
  resolveSkillSound,
} from './SoundRegistry.js';

/** 游戏音频管理 - 使用原版素材路径(publicDir = assets) */
const BGM = {
  city: '/assets/sound/music/scene.mp3',
  battle: '/assets/sound/music/battle.mp3',
  boss: '/assets/sound/music/fireBoss.mp3',
  room: '/assets/sound/background/gameRoom.mp3',
};

const SFX = {
  click: '/sound/button/normalButton.mp3',
  close: '/sound/button/close.mp3',
  page: '/sound/button/page.mp3',
  cancel: '/sound/button/cancle.mp3',
  back: '/sound/button/functionBackButton.mp3',
  invite: '/sound/button/invite.mp3',
  mainCity: '/sound/button/mainCityButton.mp3',
  otherFn: '/sound/button/otherFunctionButton.mp3',
  smallBtn: '/sound/button/smallBtn.mp3',
  sure: '/sound/button/sure.mp3',
  clickCard: '/sound/effect/global/clickCard.mp3',
  battleWin: '/sound/effect/global/win.mp3',
  battleLose: '/sound/effect/global/lose.mp3',
  smithWin: '/sound/effect/smith/win.mp3',
  smithFail: '/sound/effect/smith/fail.mp3',
  smithStart: '/sound/effect/smith/start.mp3',
  summon: DEFAULT_SUMMON,
  ambient: '/sound/background/owl.mp3',
  stunning: '/sound/effect/fire/stunning.mp3',
  jump_31: '/sound/effect/fire/jump_31.mp3',
  vertigo: '/sound/effect/fire/vertigo.mp3',
};

SFX.win = SFX.battleWin;
SFX.lose = SFX.battleLose;

export class AudioManager {
  constructor() {
    this.bgm = null;
    this.bgmKey = null;
    this.desiredBgmKey = null;
    this.muted = false;
    this.volume = 0.45;
    this.sfxVolume = 0.6;
    this.cache = new Map();
    this.playing = new Set();
    this._combatWindow = 0;
    this._combatBurst = 0;
    this._summonWindow = 0;
    this._summonBurst = 0;
    this._smithResultPlayer = null;
  }

  _get(src) {
    if (!this.cache.has(src)) {
      const a = new Audio(src);
      a.preload = 'auto';
      this.cache.set(src, a);
    }
    const player = this.cache.get(src).cloneNode();
    this.playing.add(player);
    player.addEventListener('ended', () => this.playing.delete(player), { once: true });
    return player;
  }

  /** 立即停止所有播放中的音效(PVE 战斗结束/离开房间时调用，避免音效残留) */
  stopAll() {
    for (const player of this.playing) {
      try { player.pause(); } catch { /* ignore */ }
    }
    this.playing.clear();
    this.stopBgm();
  }

  _tierVolume(tier, override) {
    if (override != null) return override;
    const mult = SFX_TIER_VOLUME[tier] ?? SFX_TIER_VOLUME.primary;
    return this.sfxVolume * mult;
  }

  playBgm(key, { loop = true, fade = false } = {}) {
    const src = BGM[key];
    if (!src) return;
    this.desiredBgmKey = key;
    if (this.muted) return;

    if (this.bgmKey === key && this.bgm) {
      if (this.bgm.paused) this.bgm.play().catch(() => {});
      return;
    }

    if (this.bgm) {
      this.bgm.pause();
      this.bgm = null;
    }

    this.bgmKey = key;
    const track = new Audio(src);
    this.bgm = track;
    track.loop = loop;
    track.volume = fade ? 0 : this.volume;
    track.play().catch(() => {});

    if (fade) {
      let v = 0;
      const step = () => {
        if (this.bgm !== track) return;
        v = Math.min(this.volume, v + 0.04);
        track.volume = v;
        if (v < this.volume) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }

  getBgmKey() {
    return this.bgmKey;
  }

  stopBgm() {
    if (this.bgm) {
      this.bgm.pause();
      this.bgm = null;
    }
    this.bgmKey = null;
    this.desiredBgmKey = null;
  }

  playSrc(src, { tier = 'primary', volume, throttle = false, throttleKind = 'combat' } = {}) {
    if (this.muted || !src) return null;
    if (throttle) {
      const allow =
        throttleKind === 'summon' ? this._allowSummonSfx() : this._allowCombatSfx();
      if (!allow) return null;
    }
    const audio = this._get(src);
    audio.volume = this._tierVolume(tier, volume);
    audio.play().catch(() => {});
    return audio;
  }

  playSfx(key, opts = {}) {
    const src = SFX[key] ?? key;
    this.playSrc(src, opts);
  }

  _allowCombatSfx() {
    const now = performance.now();
    if (now - this._combatWindow > 200) {
      this._combatWindow = now;
      this._combatBurst = 0;
    }
    if (this._combatBurst >= 4) return false;
    this._combatBurst += 1;
    return true;
  }

  _allowSummonSfx() {
    const now = performance.now();
    if (now - this._summonWindow > 280) {
      this._summonWindow = now;
      this._summonBurst = 0;
    }
    if (this._summonBurst >= 3) return false;
    this._summonBurst += 1;
    return true;
  }

  playButton(kind = 'click') {
    const map = {
      click: 'click',
      close: 'close',
      page: 'page',
      cancel: 'cancel',
      back: 'back',
      mainCity: 'mainCity',
      sure: 'sure',
      small: 'smallBtn',
    };
    this.playSfx(map[kind] ?? 'click', { tier: 'subtle' });
  }

  playClickCard() {
    this.playSfx('clickCard', { tier: 'primary' });
  }

  /** 战斗召唤/部署(己方与敌方) */
  playSummon(cardId, { throttle = true } = {}) {
    this.playSrc(resolveDeploySound(cardId), {
      tier: 'hero',
      throttle,
      throttleKind: 'summon',
    });
  }

  /** @deprecated 使用 playSummon */
  playDeploy(cardId) {
    this.playSummon(cardId);
  }

  playCardSfx(cardId) {
    this.playSummon(cardId);
  }

  playHeal(unit) {
    const healerId = unit?.cardId === 36 ? 36 : 22;
    this.playSrc(resolveAttackSound(healerId, unit), {
      tier: 'combat',
      throttle: true,
      throttleKind: 'combat',
    });
    return;
    if (unit && (unit.cardId === 122 || unit.cardId === 123 || unit.cardId === 6)) {
      this.playSfx("click");
    }
  }

  playAttack(cardId, unit) {
    // 攻击音效 1(出手音，sound.xml send：1/9/17/58)
    const start = resolveAttackStartSound(cardId);
    if (Number(cardId) === 58 && start) {
      const first = this.playSrc(start, {
        tier: 'combat',
        throttle: true,
        throttleKind: 'combat',
      });
      first?.addEventListener('ended', () => {
        this.playSrc(resolveAttackSound(cardId, unit), {
          tier: 'combat',
          throttle: true,
          throttleKind: 'combat',
        });
      }, { once: true });
      return;
    }
    if (start) {
      this.playSrc(start, { tier: 'combat', throttle: true, throttleKind: 'combat' });
    }
    // 攻击音效 2(命中音 bullet/near)
    this.playSrc(resolveAttackSound(cardId, unit), {
      tier: 'combat',
      throttle: true,
      throttleKind: 'combat',
    });
    // 多音效卡(如飞行忍者 12/45：nearAttack + other 同时播)
    const extra = resolveExtraAttackSound(cardId);
    if (extra) {
      this.playSrc(extra, { tier: 'secondary', throttle: true, throttleKind: 'combat' });
    }
  }

  playDeath(cardId) {
    const src = resolveDeathSound(cardId);
    if (src) {
      this.playSrc(src, { tier: 'secondary', throttle: true, throttleKind: 'combat' });
    }
  }

  playSkill(skillId) {
    const src = resolveSkillSound(skillId);
    if (src) {
      this.playSrc(src, { tier: 'hero' });
    }
  }

  playMove(cardId) {
    const src = resolveMoveSound(cardId);
    if (src) {
      this.playSrc(src, { tier: 'subtle', throttle: true, throttleKind: 'combat' });
    }
  }

  playBattleResult(won) {
    this.playSfx(won ? 'battleWin' : 'battleLose', { tier: 'hero' });
  }

  playSmithResult(success) {
    if (this.muted) return;
    const src = success ? SFX.smithWin : SFX.smithFail;
    let player = this._smithResultPlayer;
    if (!player) {
      player = new Audio(src);
      player.preload = 'auto';
      player.addEventListener('ended', () => this.playing.delete(player));
      this._smithResultPlayer = player;
    } else {
      try { player.pause(); } catch { /* ignore */ }
      player.src = src;
    }
    player.currentTime = 0;
    player.volume = this._tierVolume('smith');
    this.playing.add(player);
    player.play().catch(() => {});
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) {
      if (this.bgm) this.bgm.pause();
      this.bgm = null;
      this.bgmKey = null;
    } else if (this.desiredBgmKey) {
      this.playBgm(this.desiredBgmKey, { fade: true });
    }
    return this.muted;
  }

  isMuted() {
    return this.muted;
  }
}

export const audio = new AudioManager();
