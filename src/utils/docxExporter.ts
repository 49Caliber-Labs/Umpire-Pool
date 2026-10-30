import { WeeklyDispatch, Game, Player, PlayerPickData } from '../types';
import { getSavedPoolConfig } from '../config/leagueConfig';
import { isGameTie } from './nflTieEngine';

/**
 * Utility to export a fully editable Word Document (.doc)
 * for any configured Umpire Equipment Fundraiser Pool dispatch.
 */
export async function generateDispatchDocx(
  dispatch: WeeklyDispatch,
  games: Game[] = [],
  players: Player[] = [],
  picks: Record<string, PlayerPickData> = {}
): Promise<void> {
  const cfg = getSavedPoolConfig();
  const leagueName = cfg.leagueName || 'Umpire Gear NFL Pool';
  const associationName = cfg.associationName || 'Youth Sports Umpire Equipment Fundraiser';
  const crewChiefTitle = cfg.crewChiefTitle || 'Umpire-in-Chief';
  const crewChiefName = cfg.crewChiefName || cfg.adminName || 'Umpire-in-Chief';
  const adminName = cfg.adminName || 'Pool Admin';
  const weekNum = dispatch.week || dispatch.weekNumber || games[0]?.week || cfg.startingWeek || 1;
  const dispatchTitle = dispatch.title || `${leagueName} - Week ${weekNum} Dispatch`;

  const mnfGame = games.find(g => g.isMNF) || games[games.length - 1];
  const mnfActualPoints = mnfGame && mnfGame.status === 'final'
    ? (mnfGame.awayScore || 0) + (mnfGame.homeScore || 0)
    : null;

  const activePlayers = players.filter(p => p.isActive !== false);
  const scoredRows = activePlayers.map(player => {
    const pData = picks[player.name];
    let wins = 0;
    let losses = 0;
    games.forEach(g => {
      if (g.status === 'final' && !isGameTie(g)) {
        const winner = g.officialWinner || ((g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeam : g.awayTeam);
        const picked = pData?.picks?.[g.gameNumber];
        if (picked && winner) {
          if (picked === winner) wins++;
          else losses++;
        } else if (winner) {
          losses++;
        }
      }
    });
    const mnfPick = (mnfGame && pData?.picks?.[mnfGame.gameNumber]) || '—';
    const tbVal = pData?.tiebreaker !== undefined && pData?.tiebreaker !== '' ? Number(pData.tiebreaker) : null;
    const tbDiff = (mnfActualPoints !== null && tbVal !== null && !isNaN(tbVal))
      ? Math.abs(tbVal - mnfActualPoints)
      : 999;
    return { player, wins, losses, mnfPick, tbVal, tbDiff };
  });

  const maxWins = scoredRows.length > 0 ? Math.max(...scoredRows.map(r => r.wins)) : 0;
  scoredRows.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.wins === maxWins && mnfActualPoints !== null && a.tbDiff !== b.tbDiff) {
      return a.tbDiff - b.tbDiff;
    }
    return a.player.name.localeCompare(b.player.name);
  });

  const rowsHtml = scoredRows.map((row, idx) => {
    const isFirst = idx === 0 && maxWins > 0;
    const tbDisplay = row.tbVal !== null ? `${row.mnfPick} (${row.tbVal})` : row.mnfPick;
    return `
      <tr class="${isFirst ? 'winner-row' : ''}">
        <td>${isFirst ? '#1 👑' : `#${idx + 1}`}</td>
        <td>${row.player.name}</td>
        <td style="text-align: center;">${row.wins}</td>
        <td style="text-align: center;">${row.losses}</td>
        <td style="text-align: right;">${tbDisplay}</td>
      </tr>
    `;
  }).join('');

  const rawBody = dispatch.body_html || dispatch.content || '';

  const wordContent = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>${dispatchTitle}</title>
      <!--[if gte mso 9]>
      <xml>
        <w:WordDocument>
          <w:View>Print</w:View>
          <w:Zoom>100</w:Zoom>
          <w:DoNotOptimizeForBrowser/>
        </w:WordDocument>
      </xml>
      <![endif]-->
      <style>
        body {
          font-family: 'Calibri', 'Helvetica Arial', sans-serif;
          font-size: 11pt;
          color: #0f172a;
          line-height: 1.5;
          margin: 0.5in;
        }
        h1 {
          font-size: 18pt;
          color: #1b3a2b;
          text-transform: uppercase;
          margin-bottom: 2pt;
          font-weight: bold;
        }
        h2 {
          font-size: 13pt;
          color: #ca8a04;
          text-transform: uppercase;
          margin-top: 0;
          margin-bottom: 12pt;
          font-weight: bold;
        }
        h3 {
          font-size: 12pt;
          color: #1b3a2b;
          text-transform: uppercase;
          border-bottom: 2pt solid #1b3a2b;
          padding-bottom: 3pt;
          margin-top: 14pt;
          margin-bottom: 8pt;
          font-weight: bold;
        }
        .header-box {
          border-bottom: 2pt solid #1b3a2b;
          padding-bottom: 10pt;
          margin-bottom: 14pt;
        }
        .gold-badge {
          background-color: #fef08a;
          color: #713f12;
          border: 1pt solid #ca8a04;
          padding: 3pt 8pt;
          font-weight: bold;
          font-size: 9pt;
          border-radius: 4pt;
          display: inline-block;
          margin-bottom: 6pt;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 8pt;
          margin-bottom: 14pt;
          font-size: 10pt;
        }
        th {
          background-color: #1b3a2b;
          color: #ffffff;
          font-weight: bold;
          padding: 6pt 8pt;
          text-align: left;
        }
        td {
          padding: 5pt 8pt;
          border-bottom: 1pt solid #e2e8f0;
        }
        .winner-row {
          background-color: #fef9c3;
          font-weight: bold;
        }
        .footer-note {
          font-size: 8.5pt;
          color: #64748b;
          border-top: 1pt solid #cbd5e1;
          padding-top: 6pt;
          margin-top: 20pt;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="header-box">
        <div class="gold-badge">⚾ ${associationName} • Est. 1986 Tradition</div>
        <h1>${leagueName}</h1>
        <h2>${dispatch.type === 'friday' ? `WEEK ${weekNum} FRIDAY NIGHT WIRE & INJURY INTEL` : dispatch.type === 'sunday' ? `WEEK ${weekNum} SUNDAY NIGHT RECAP & STANDINGS` : `WEEK ${weekNum} CROWN & OFFICIAL DISPATCH`}</h2>
        <p style="font-size: 9.5pt; color: #475569; margin: 0;">
          <strong>${crewChiefTitle}:</strong> ${crewChiefName} &bull;
          <strong>Pool Admin:</strong> ${adminName}
        </p>
      </div>

      ${rawBody ? rawBody : `
        <h3>📋 WEEK ${weekNum} OFFICIAL STANDINGS &amp; SCORES</h3>
        <table>
          <thead>
            <tr>
              <th style="width: 50pt;">Rank</th>
              <th style="width: 140pt;">Contender</th>
              <th style="text-align: center; width: 50pt;">Wins</th>
              <th style="text-align: center; width: 50pt;">Losses</th>
              <th style="text-align: right;">MNF Pick (Tiebreaker Total)</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      `}

      <div class="footer-note">
        ${leagueName} &bull; ${associationName} &bull; Official Week ${weekNum} Record
      </div>
    </body>
    </html>
  `;

  const blob = new Blob(['\ufeff' + wordContent], {
    type: 'application/msword'
  });

  const slug = leagueName.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'Umpire_Pool';
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slug}_Week_${weekNum}_Dispatch.doc`;
  document.body.appendChild(link);
  link.click();

  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 200);
}
