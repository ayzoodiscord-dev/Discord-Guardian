import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const DEFAULT_GUILD_SETTINGS = Object.freeze({
  welcomeChannelId: null,
  welcomeMessage: "Bienvenue {user} sur **{server}** ! Tu es le membre **{memberCount}**.",
  goodbyeChannelId: null,
  goodbyeMessage: "{user} a quitté **{server}**. Bonne continuation.",
  logChannelId: null,
  eventLogsEnabled: false,
  antiRaidEnabled: false,
  antiRaidThreshold: 5,
  antiRaidWindowSeconds: 10,
  levelsEnabled: true,
  vipRoleId: null,
  vipChannelId: null,
  ticketStaffRoleId: null,
  ticketCategoryId: null,
  autoRoleId: null,
  automodEnabled: false,
  automodLinks: false,
  automodMentions: false,
  automodMaxMentions: 5,
  automodSpamThreshold: 5,
  automodSpamWindowSeconds: 8,
  automodBlockedWords: [],
});

function getLevel(totalXp) {
  return Math.floor(Math.sqrt(Math.max(0, totalXp) / 100));
}

export class Store {
  constructor(filePath = process.env.DATA_FILE || "./data/bot-data.json") {
    this.filePath = resolve(filePath);
    this.data = { guilds: {}, members: {}, warnings: {}, giveaways: {}, tickets: {} };
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
        giveaways: loaded.giveaways ?? {},
        tickets: loaded.tickets ?? {},
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

  async createGiveaway({ guildId, channelId, prize, winnersCount, endsAt, hostId }) {
    const id = randomUUID().replaceAll("-", "").slice(0, 12);
    const giveaway = {
      id,
      guildId,
      channelId,
      messageId: null,
      prize,
      winnersCount,
      endsAt,
      hostId,
      entries: [],
      winners: [],
      ended: false,
      endedAt: null,
    };
    this.data.giveaways[id] = giveaway;
    await this.save();
    return giveaway;
  }

  getGiveaway(guildId, id) {
    const giveaway = this.data.giveaways[id];
    return giveaway?.guildId === guildId ? giveaway : null;
  }

  getActiveGiveaways() {
    return Object.values(this.data.giveaways).filter((giveaway) => !giveaway.ended);
  }

  async setGiveawayMessageId(guildId, id, messageId) {
    const giveaway = this.getGiveaway(guildId, id);
    if (!giveaway) return null;
    giveaway.messageId = messageId;
    await this.save();
    return giveaway;
  }

  async deleteGiveaway(guildId, id) {
    const giveaway = this.getGiveaway(guildId, id);
    if (!giveaway) return false;
    delete this.data.giveaways[id];
    await this.save();
    return true;
  }

  async toggleGiveawayEntry(guildId, id, userId) {
    const giveaway = this.getGiveaway(guildId, id);
    if (!giveaway || giveaway.ended) return null;
    const existingIndex = giveaway.entries.indexOf(userId);
    if (existingIndex >= 0) {
      giveaway.entries.splice(existingIndex, 1);
      await this.save();
      return { entered: false, giveaway };
    }
    giveaway.entries.push(userId);
    await this.save();
    return { entered: true, giveaway };
  }

  async finishGiveaway(guildId, id, { reroll = false } = {}) {
    const giveaway = this.getGiveaway(guildId, id);
    if (!giveaway || (reroll ? !giveaway.ended : giveaway.ended)) return null;
    const excluded = reroll ? new Set(giveaway.winners) : new Set();
    const candidates = giveaway.entries.filter((userId) => !excluded.has(userId));
    if (reroll && candidates.length === 0) return null;
    for (let index = candidates.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]];
    }
    giveaway.winners = candidates.slice(0, giveaway.winnersCount);
    if (!reroll) {
      giveaway.ended = true;
      giveaway.endedAt = Date.now();
    }
    await this.save();
    return giveaway;
  }

  exportGuildBackup(guildId) {
    return {
      format: "discord-bot-server-backup",
      version: 1,
      guildId,
      createdAt: Date.now(),
      settings: this.getGuildSettings(guildId),
      members: Object.values(this.data.members).filter((member) => member.guildId === guildId),
      warnings: Object.values(this.data.warnings).filter((warning) => warning.guildId === guildId),
      giveaways: Object.values(this.data.giveaways).filter((giveaway) => giveaway.guildId === guildId),
      tickets: Object.values(this.data.tickets).filter((ticket) => ticket.guildId === guildId),
    };
  }

  async restoreGuildBackup(guildId, backup) {
    if (
      !backup
      || backup.format !== "discord-bot-server-backup"
      || backup.version !== 1
      || backup.guildId !== guildId
      || !backup.settings
      || !Array.isArray(backup.members)
      || !Array.isArray(backup.warnings)
      || !Array.isArray(backup.giveaways)
      || (backup.tickets != null && !Array.isArray(backup.tickets))
    ) {
      throw new Error("Le fichier n'est pas une sauvegarde valide de ce serveur.");
    }

    const safeSettings = { ...DEFAULT_GUILD_SETTINGS };
    for (const key of Object.keys(DEFAULT_GUILD_SETTINGS)) {
      const value = backup.settings[key];
      const fallback = DEFAULT_GUILD_SETTINGS[key];
      if (Array.isArray(fallback) && Array.isArray(value)) {
        safeSettings[key] = value.filter((item) => typeof item === "string").slice(0, 100);
      } else if (fallback === null && (value === null || typeof value === "string")) {
        safeSettings[key] = value;
      } else if (typeof fallback === "boolean" && typeof value === "boolean") {
        safeSettings[key] = value;
      } else if (typeof fallback === "number" && Number.isFinite(value)) {
        safeSettings[key] = value;
      } else if (typeof fallback === "string" && typeof value === "string") {
        safeSettings[key] = value.slice(0, 1000);
      }
    }
    const safeMembers = backup.members.filter((member) =>
      member.guildId === guildId
      && typeof member.userId === "string"
      && Number.isFinite(member.xp)
      && Number.isFinite(member.messages),
    );
    const safeWarnings = backup.warnings.filter((warning) =>
      warning.guildId === guildId
      && typeof warning.id === "string"
      && typeof warning.userId === "string"
      && typeof warning.moderatorId === "string"
      && typeof warning.reason === "string",
    );
    const safeGiveaways = backup.giveaways.filter((giveaway) =>
      giveaway.guildId === guildId
      && typeof giveaway.id === "string"
      && typeof giveaway.channelId === "string"
      && typeof giveaway.prize === "string"
      && giveaway.prize.length <= 200
      && typeof giveaway.hostId === "string"
      && Number.isInteger(giveaway.winnersCount)
      && giveaway.winnersCount >= 1
      && giveaway.winnersCount <= 20
      && Number.isFinite(giveaway.endsAt)
      && Array.isArray(giveaway.entries),
    );
    const safeTickets = (backup.tickets ?? []).filter((ticket) =>
      ticket.guildId === guildId
      && typeof ticket.id === "string"
      && typeof ticket.channelId === "string"
      && typeof ticket.userId === "string"
      && typeof ticket.subject === "string"
      && ["open", "closed"].includes(ticket.status)
      && Number.isFinite(ticket.createdAt),
    );

    this.data.guilds[guildId] = { ...DEFAULT_GUILD_SETTINGS, ...safeSettings };
    for (const [key, member] of Object.entries(this.data.members)) {
      if (member.guildId === guildId) delete this.data.members[key];
    }
    for (const [id, warning] of Object.entries(this.data.warnings)) {
      if (warning.guildId === guildId) delete this.data.warnings[id];
    }
    for (const [id, giveaway] of Object.entries(this.data.giveaways)) {
      if (giveaway.guildId === guildId) delete this.data.giveaways[id];
    }
    for (const [id, ticket] of Object.entries(this.data.tickets)) {
      if (ticket.guildId === guildId) delete this.data.tickets[id];
    }

    for (const member of safeMembers) {
      this.data.members[`${guildId}:${member.userId}`] = {
        guildId,
        userId: member.userId,
        xp: Math.max(0, member.xp),
        messages: Math.max(0, member.messages),
        lastXpAt: Number.isFinite(member.lastXpAt) ? member.lastXpAt : 0,
      };
    }
    for (const warning of safeWarnings) this.data.warnings[warning.id] = warning;
    for (const giveaway of safeGiveaways) {
      this.data.giveaways[giveaway.id] = {
        ...giveaway,
        entries: giveaway.entries.filter((id) => typeof id === "string").slice(0, 100_000),
        winners: Array.isArray(giveaway.winners) ? giveaway.winners.filter((id) => typeof id === "string").slice(0, 20) : [],
        ended: Boolean(giveaway.ended),
        endedAt: Number.isFinite(giveaway.endedAt) ? giveaway.endedAt : null,
      };
    }
    for (const ticket of safeTickets) {
      this.data.tickets[ticket.id] = {
        ...ticket,
        closedAt: Number.isFinite(ticket.closedAt) ? ticket.closedAt : null,
        closedBy: typeof ticket.closedBy === "string" ? ticket.closedBy : null,
      };
    }
    await this.save();
  }

  async createTicket({ id, guildId, channelId, userId, subject }) {
    const ticket = {
      id: id ?? randomUUID().replaceAll("-", "").slice(0, 12),
      guildId,
      channelId,
      userId,
      subject,
      status: "open",
      createdAt: Date.now(),
      closedAt: null,
      closedBy: null,
    };
    this.data.tickets[ticket.id] = ticket;
    await this.save();
    return ticket;
  }

  getTicket(guildId, id) {
    const ticket = this.data.tickets[id];
    return ticket?.guildId === guildId ? ticket : null;
  }

  getTicketByChannel(guildId, channelId) {
    return Object.values(this.data.tickets).find((ticket) =>
      ticket.guildId === guildId && ticket.channelId === channelId,
    ) ?? null;
  }

  getOpenTicketForUser(guildId, userId) {
    return Object.values(this.data.tickets).find((ticket) =>
      ticket.guildId === guildId && ticket.userId === userId && ticket.status === "open",
    ) ?? null;
  }

  getTicketsForGuild(guildId, limit = 20) {
    return Object.values(this.data.tickets)
      .filter((ticket) => ticket.guildId === guildId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  async updateTicket(guildId, id, changes) {
    const ticket = this.getTicket(guildId, id);
    if (!ticket) return null;
    Object.assign(ticket, changes);
    await this.save();
    return ticket;
  }

  async deleteTicket(guildId, id) {
    const ticket = this.getTicket(guildId, id);
    if (!ticket) return false;
    delete this.data.tickets[id];
    await this.save();
    return true;
  }
}
