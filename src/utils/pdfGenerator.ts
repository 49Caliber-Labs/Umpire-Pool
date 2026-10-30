import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { WeeklyDispatch, Game, Player, PlayerPickData } from '../types';
import { getSavedPoolConfig } from '../config/leagueConfig';
import { isGameTie } from './nflTieEngine';

/**
 * Utility to generate a publication-grade PDF for any configured Umpire Equipment Fundraiser Pool
 */
export async function generateDispatchPDF(
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
    return {
      player,
      wins,
      losses,
      mnfPick,
      tbVal,
      tbDiff
    };
  });

  const maxWins = scoredRows.length > 0 ? Math.max(...scoredRows.map(r => r.wins)) : 0;
  scoredRows.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.wins === maxWins && mnfActualPoints !== null && a.tbDiff !== b.tbDiff) {
      return a.tbDiff - b.tbDiff;
    }
    return a.player.name.localeCompare(b.player.name);
  });

  const tableRowsHtml = scoredRows.map((row, idx) => {
    const isFirst = idx === 0 && maxWins > 0;
    const rankLabel = isFirst ? '#1 👑' : `#${idx + 1}`;
    const tbDisplay = row.tbVal !== null ? `${row.mnfPick} (${row.tbVal})` : row.mnfPick;
    return `
      <tr style="background-color: ${isFirst ? '#fef9c3' : idx % 2 === 0 ? '#ffffff' : '#f8fafc'}; font-weight: ${isFirst ? '800' : '700'}; border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 4px 8px; color: ${isFirst ? '#854d0e' : '#334155'};">${rankLabel}</td>
        <td style="padding: 4px 8px; color: ${isFirst ? '#713f12' : '#0f172a'};">${row.player.name}</td>
        <td style="padding: 4px 8px; text-align: center; color: #15803d; font-weight: 800;">${row.wins}</td>
        <td style="padding: 4px 8px; text-align: center; color: #b91c1c;">${row.losses}</td>
        <td style="padding: 4px 8px; text-align: right; color: #475569;">${tbDisplay}</td>
      </tr>
    `;
  }).join('');

  const page1 = document.createElement('div');
  page1.style.width = '800px';
  page1.style.minHeight = '1130px';
  page1.style.padding = '32px 36px';
  page1.style.backgroundColor = '#ffffff';
  page1.style.fontFamily = 'Helvetica, Arial, sans-serif';
  page1.style.color = '#0f172a';
  page1.style.position = 'absolute';
  page1.style.left = '-9999px';
  page1.style.top = '0';
  page1.style.boxSizing = 'border-box';

  const rawBodyHtml = dispatch.body_html || dispatch.content || '';

  page1.innerHTML = `
    <div style="display: flex; flex-direction: column; justify-content: space-between; min-height: 1060px;">
      <div>
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #1b3a2b; padding-bottom: 14px; margin-bottom: 18px;">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div style="background: linear-gradient(135deg, #fef08a 0%, #eab308 100%); color: #713f12; border: 2px solid #ca8a04; width: 52px; height: 52px; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0;">
              <span style="font-size: 16px; line-height: 1;">⚾</span>
              <span style="font-size: 7px; font-weight: 900; text-transform: uppercase; margin-top: 1px;">1986</span>
            </div>
            <div>
              <h1 style="margin: 0; font-size: 20px; font-weight: 900; color: #1b3a2b; text-transform: uppercase;">
                ${leagueName}
              </h1>
              <h2 style="margin: 2px 0 0 0; font-size: 12px; font-weight: 800; color: #ca8a04; text-transform: uppercase;">
                ${associationName} • WEEK ${weekNum} DISPATCH
              </h2>
            </div>
          </div>

          <div style="text-align: right; font-size: 10px; color: #475569; font-weight: 600;">
            <div style="background-color: #1b3a2b; color: #fde047; font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 4px; display: inline-block; margin-bottom: 4px;">
              ${dispatch.type === 'friday' ? 'FRIDAY WIRE' : dispatch.type === 'sunday' ? 'SUNDAY RECAP' : 'TUESDAY FINAL'}
            </div>
            <div>${crewChiefTitle}: ${crewChiefName}</div>
            <div>Admin: ${adminName}</div>
          </div>
        </div>

        <div style="margin-bottom: 16px;">
          ${rawBodyHtml ? rawBodyHtml : `
            <h3 style="margin: 0 0 8px 0; font-size: 13px; font-weight: 900; color: #1b3a2b; text-transform: uppercase;">
              WEEK ${weekNum} STANDINGS &amp; SCORES
            </h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 10.5px;">
              <thead>
                <tr style="background-color: #1b3a2b; color: #ffffff; text-align: left;">
                  <th style="padding: 5px 8px; font-weight: 800; width: 60px;">Rank</th>
                  <th style="padding: 5px 8px; font-weight: 800; width: 160px;">Contender</th>
                  <th style="padding: 5px 8px; font-weight: 800; text-align: center; width: 60px;">Wins</th>
                  <th style="padding: 5px 8px; font-weight: 800; text-align: center; width: 60px;">Losses</th>
                  <th style="padding: 5px 8px; font-weight: 800; text-align: right;">MNF Pick (TB)</th>
                </tr>
              </thead>
              <tbody>
                ${tableRowsHtml}
              </tbody>
            </table>
          `}
        </div>
      </div>

      <div style="border-top: 1px solid #e2e8f0; padding-top: 8px; display: flex; justify-content: space-between; font-size: 9.5px; color: #64748b;">
        <div>${leagueName} • ${associationName}</div>
        <div style="font-weight: 700;">Week ${weekNum} Official Record</div>
      </div>
    </div>
  `;

  document.body.appendChild(page1);

  try {
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const canvas1 = await html2canvas(page1, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });
    const imgData1 = canvas1.toDataURL('image/png');
    pdf.addImage(imgData1, 'PNG', 0, 0, 210, 297);

    const slug = leagueName.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'Umpire_Pool';
    pdf.save(`${slug}_Week_${weekNum}_Dispatch.pdf`);
  } catch (err) {
    console.error('Error generating PDF:', err);
    window.print();
  } finally {
    if (document.body.contains(page1)) document.body.removeChild(page1);
  }
}
