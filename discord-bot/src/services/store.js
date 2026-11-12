import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const DEFAULT_GUILD_SETTINGS = Object.freeze({
  welcomeChannelId: null,
  welcomeMessage: "Bienvenue {user} sur **{server}** ! Tu es le membre **{memberCount}**.",
  goodbyeChannelId: null,
  goodbyeMessage: "{user} a quitté **{server}**. Bonne continuation.",
  logChannelId: null,
  antiRaidEnabled: false,
  antiRaidThreshold: 5,
  antiRaidWindowSeconds: 10,
  levelsEnabled: true,
});

function getLevel(totalXp) {
  return Math.floor(Math.sqrt(Math.max(0, totalXp) / 100));
}

export class Store {
  constructor(filePath = process.env.DATA_FILE || "./data/bot-data.json") {
    this.filePath = resolve(filePath);
    this.data = { guilds: {}, members: {}, warnings: {} };
    this.pendingWrite = Promise.resolve();
  }

  async load() {
    await mkdir(dirname(this.filePath), { recursive: true });
    try {
      const raw = await readFile(this.filePath, "utf8");
      const loaded = JSON.parse(raw);
      this.data = {
        guilds: loaded.guilds ?? {},
        members: loaded.members ?? {},
        warnings: loaded.warnings ?? {},
      };
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw new Error(`Impossible de lire les données (${this.filePath}) : ${error.message}`);
      }
      await this.save();
    }
    return this;
  }

  save() {
    const snapshot = JSON.stringify(this.data, null, 2);
    this.pendingWrite = this.pendingWrite
      .catch(() => {})
      .then(async () => {
        const temporaryPath = `${this.filePath}.tmp`;
        await writeFile(temporaryPath, snapshot, "utf8");
        await rename(temporaryPath, this.filePath);
      });
    return this.pendingWrite;
  }

  flush() {
    return this.pendingWrite;
  }

  getGuildSettings(guildId) {
    return { ...DEFAULT_GUILD_SETTINGS, ...(this.data.guilds[guildId] ?? {}) };
  }

  async updateGuildSettings(guildId, changes) {
    this.data.guilds[guildId] = { ...this.getGuildSettings(guildId), ...changes };
    await this.save();
    return this.getGuildSettings(guildId);
  }

  getMember(guildId, userId) {
    return this.data.members[`${guildId}:${userId}`] ?? {
      guildId,
      userId,
      xp: 0,
      messages: 0,
      lastXpAt: 0,
    };
  }

  async addMessageXp(guildId, userId, now = Date.now()) {
    const key = `${guildId}:${userId}`;
    const member = this.getMember(guildId, userId);
    member.messages += 1;

    let awarded = 0;
    let leveledUp = false;
    if (now - member.lastXpAt >= 60_000) {
      const previousLevel = getLevel(member.xp);
      awarded = 15 + Math.floor(Math.random() * 11);
      member.xp += awarded;
      member.lastXpAt = now;
      leveledUp = getLevel(member.xp) > previousLevel;
    }

    this.data.members[key] = member;
    await this.save();
    return {
      ...member,
      awarded,
      leveledUp,
      level: getLevel(member.xp),
      previousLevel: getLevel(member.xp - awarded),
    };
  }

  getProgress(guildId, userId) {
    const member = this.getMember(guildId, userId);
    const level = getLevel(member.xp);
    const floorXp = level ** 2 * 100;
    const nextLevelXp = (level + 1) ** 2 * 100;
    return {
      ...member,
      level,
      currentLevelXp: member.xp - floorXp,
      nextLevelXp: nextLevelXp - floorXp,
      xpToNextLevel: nextLevelXp - member.xp,
    };
  }

  getLeaderboard(guildId, limit = 10) {
    return Object.values(this.data.members)
      .filter((member) => member.guildId === guildId)
      .sort((a, b) => b.xp - a.xp)
      .slice(0, limit)
      .map((member, index) => ({
        ...member,
        rank: index + 1,
        level: getLevel(member.xp),
      }));
  }

  async addWarning(guildId, userId, moderatorId, reason) {
    const warning = {
      id: randomUUID().slice(0, 8),
      guildId,
      userId,
      moderatorId,
      reason,
      createdAt: Date.now(),
    };
    this.data.warnings[warning.id] = warning;
    await this.save();
    return warning;
  }

  getWarnings(guildId, userId) {
    return Object.values(this.data.warnings)
      .filter((warning) => warning.guildId === guildId && warning.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async removeWarning(guildId, warningId) {
    const warning = this.data.warnings[warningId];
    if (!warning || warning.guildId !== guildId) return false;
    delete this.data.warnings[warningId];
    await this.save();
    return true;
  }
}
