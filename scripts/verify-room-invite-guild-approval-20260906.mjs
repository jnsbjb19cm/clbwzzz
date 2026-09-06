import assert from 'node:assert/strict';
import fs from 'node:fs';

const invitePolicy = await import('../server/socket/RoomInvitePolicy20260906.js');
const guildPolicy = await import('../src/ui/GuildPermissionPolicy20260906.js');

const {
  normalizeLobbyPresence20260906,
  canInviteLobbyPlayer20260906,
  ROOM_INVITE_TTL_MS_20260906,
} = invitePolicy;
const {
  normalizeGuildRole20260906,
  canApproveGuildJoin20260906,
} = guildPolicy;

assert.equal(normalizeLobbyPresence20260906('LOBBY'), 'lobby');
assert.equal(normalizeLobbyPresence20260906('room'), 'room');
assert.equal(normalizeLobbyPresence20260906('battle'), 'battle');
assert.equal(normalizeLobbyPresence20260906('unknown'), 'offline');
assert.ok(ROOM_INVITE_TTL_MS_20260906 >= 30_000 && ROOM_INVITE_TTL_MS_20260906 <= 60_000, 'room invite must expire in a bounded 30-60s window');

assert.equal(canInviteLobbyPlayer20260906({
  inviterUserId: 1,
  targetUserId: 2,
  targetOnline: true,
  targetPresence: 'lobby',
  targetHasRoom: false,
}), true, 'online player currently in the lobby should be inviteable');
assert.equal(canInviteLobbyPlayer20260906({ inviterUserId: 1, targetUserId: 1, targetOnline: true, targetPresence: 'lobby', targetHasRoom: false }), false, 'cannot invite self');
assert.equal(canInviteLobbyPlayer20260906({ inviterUserId: 1, targetUserId: 2, targetOnline: false, targetPresence: 'lobby', targetHasRoom: false }), false, 'offline player is not inviteable');
assert.equal(canInviteLobbyPlayer20260906({ inviterUserId: 1, targetUserId: 2, targetOnline: true, targetPresence: 'room', targetHasRoom: true }), false, 'player already in a room is not inviteable');
assert.equal(canInviteLobbyPlayer20260906({ inviterUserId: 1, targetUserId: 2, targetOnline: true, targetPresence: 'battle', targetHasRoom: false }), false, 'player in battle is not a lobby invite target');

assert.equal(normalizeGuildRole20260906(' president '), 'president');
assert.equal(normalizeGuildRole20260906('VICE-PRESIDENT'), 'vice_president');
assert.equal(canApproveGuildJoin20260906('president'), true);
assert.equal(canApproveGuildJoin20260906('vice_president'), true);
assert.equal(canApproveGuildJoin20260906('elite'), false);
assert.equal(canApproveGuildJoin20260906('member'), false);

const socketClientSource = fs.readFileSync(new URL('../src/network/SocketClient.js', import.meta.url), 'utf8');
const inviteRuntimeSource = fs.readFileSync(new URL('../src/ui/RoomInviteRuntime20260906.js', import.meta.url), 'utf8');
const inviteServiceSource = fs.readFileSync(new URL('../server/socket/RoomInviteService20260906.js', import.meta.url), 'utf8');
const inviteCssSource = fs.readFileSync(new URL('../src/ui/RoomInviteRuntime20260906.css', import.meta.url), 'utf8');
const serverIndexSource = fs.readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
const guildViewSource = fs.readFileSync(new URL('../src/ui/GuildView.js', import.meta.url), 'utf8');
const guildRouteSource = fs.readFileSync(new URL('../server/routes/guild.js', import.meta.url), 'utf8');
const bootstrapSource = fs.readFileSync(new URL('../src/bootstrap.js', import.meta.url), 'utf8');

assert.match(socketClientSource, /room:invite:list/, 'client must request eligible lobby players from server');
assert.match(socketClientSource, /room:invite:send/, 'client must send room invitations through server authority');
assert.match(socketClientSource, /room:invite:respond/, 'client must accept/reject invitations through server authority');
assert.match(socketClientSource, /lobby:presence/, 'client must explicitly maintain lobby presence');

assert.match(inviteServiceSource, /room:invite:list/, 'server must expose authoritative invite candidate list');
assert.match(inviteServiceSource, /room:invite:send/, 'server must validate and deliver invitations');
assert.match(inviteServiceSource, /room:invite:respond/, 'server must validate accept/reject responses');
assert.match(inviteServiceSource, /socketsForUser/, 'server must deliver invitation to all target player sockets');
assert.match(inviteServiceSource, /roomManager\.joinRoom/, 'accepted invitation must reuse normal authoritative room join rules');
assert.match(inviteServiceSource, /ROOM_INVITE_TTL_MS_20260906/, 'server invitations must expire');
assert.match(inviteServiceSource, /room\.status !== 'waiting'/, 'server must reject invitations after the room starts');
assert.match(serverIndexSource, /installRoomInviteService20260906\(io\)/, 'room invite service must be installed on server');

assert.match(inviteRuntimeSource, /setLobbyPresence\('lobby'\)/, 'room lobby runtime must publish lobby presence');
assert.match(inviteRuntimeSource, /setLobbyPresence\('room'\)/, 'room entry must publish room presence');
assert.match(inviteRuntimeSource, /setLobbyPresence\('battle'\)/, 'battle entry must publish battle presence');
assert.match(inviteRuntimeSource, /RoomView\.prototype\.enterSpectatorBattle/, 'active spectators must leave lobby presence');
assert.match(inviteRuntimeSource, /RoomView\.prototype\.exitSpectatorBattle/, 'spectator exit must restore lobby presence');
assert.match(inviteRuntimeSource, /view\.roomBattleView/, 'invite prompts must not appear over an active battle/spectator battle');
assert.match(inviteRuntimeSource, /邀请大厅玩家/, 'room UI must provide an explicit lobby-player invite entry');
assert.match(inviteRuntimeSource, /room:invite/, 'lobby client must receive room invitation events');
assert.match(inviteRuntimeSource, /接受/, 'invite prompt must expose accept action');
assert.match(inviteRuntimeSource, /拒绝/, 'invite prompt must expose reject action');
assert.match(inviteCssSource, /room-lobby-invite-btn-20260906/, 'invite entry must have dedicated room styling');
assert.match(bootstrapSource, /installRoomInviteRuntime20260906\(\)/, 'room invite runtime must be installed before RoomView use');

assert.match(guildViewSource, /canApproveGuildJoin20260906/, 'guild approval button visibility must use shared role policy');
assert.match(guildViewSource, /guild-approve-btn/, 'guild approval button must exist for authorized roles');
assert.match(guildRouteSource, /canApproveGuildJoinRole20260906/, 'guild approval API must use normalized authoritative role policy');
assert.match(guildRouteSource, /canApprove:/, 'guild /my payload must expose explicit approval permission');
assert.doesNotMatch(guildViewSource, /\['president', 'vice_president'\]\.includes\(g\.role\)/, 'guild approval button must not depend on the old fragile raw role comparison');

console.log('PASS room invite + guild approval regression 20260906');