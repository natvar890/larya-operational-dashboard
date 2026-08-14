/**
 * LARYA Monthly Operational Report
 * Runs: 1st of month at 9 AM America/Sao_Paulo
 * Reports: Previous month complete funnel + rankings + forecast
 */

const https = require('https');
const { DateTime } = require('luxon');
const DashboardData = require('./dashboard-data-queries');

class MonthlyReportGenerator {
  constructor(apiKey, webhookUrl, timezone = 'America/Sao_Paulo') {
    this.dashboardData = new DashboardData(apiKey);
    this.webhookUrl = webhookUrl;
    this.timezone = timezone;
  }

  /**
   * Get previous month date range
   */
  getPreviousMonthRange() {
    const now = DateTime.now().setZone(this.timezone);
    const startOfThisMonth = now.startOf('month');
    const startOfLastMonth = startOfThisMonth.minus({ months: 1 });
    const endOfLastMonth = startOfLastMonth.endOf('month');

    return {
      start: startOfLastMonth.toISO(),
      end: endOfLastMonth.toISO(),
      displayMonth: startOfLastMonth.toFormat('MMMM yyyy'),
      monthYear: startOfLastMonth.toFormat('MM/yyyy')
    };
  }

  /**
   * Generate formatted Slack message for monthly report
   */
  async generateSlackMessage() {
    try {
      const dateRange = this.getPreviousMonthRange();
      const funnel = await this.dashboardData.buildFunnel(dateRange.start, dateRange.end);
      const forecast = await this.dashboardData.calculateForecast();
      const formatted = this.dashboardData.formatFunnelForDisplay(funnel);

      const blocks = [];

      // Header
      blocks.push({
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📈 LARYA Monthly Report - ${dateRange.displayMonth}`,
          emoji: true
        }
      });

      // Main funnel
      blocks.push(this.buildFunnelSection(formatted.funnel));

      // Conversions
      blocks.push(this.buildConversionSection(funnel.conversions));

      // Top performers by leads
      blocks.push({
        type: 'divider'
      });
      blocks.push(this.buildTopPerformersByLeads(formatted.byRep));

      // Top performers by revenue
      blocks.push({
        type: 'divider'
      });
      blocks.push(this.buildTopPerformersByRevenue(formatted.byRep));

      // Partner rankings
      blocks.push({
        type: 'divider'
      });
      blocks.push(this.buildPartnerRankings(formatted.byPartner));

      // Forecast
      if (forecast) {
        blocks.push({
          type: 'divider'
        });
        blocks.push(this.buildForecastSection(forecast));
      }

      return { blocks };
    } catch (error) {
      console.error('Error generating monthly report:', error);
      throw error;
    }
  }

  /**
   * Build main funnel visualization section
   */
  buildFunnelSection(funnel) {
    let funnelText = `*Lead Entrou*: ${funnel[0].count}\n`;
    
    for (let i = 0; i < funnel.length - 1; i++) {
      const current = funnel[i];
      const next = funnel[i + 1];
      const rate = current.count > 0 ? ((next.count / current.count) * 100).toFixed(1) : 0;
      
      funnelText += `  ↓ ${rate}%\n`;
      funnelText += `*${next.stage}*: ${next.count}\n`;
    }

    funnelText += `\n*Total Revenue This Month*: R$ ${funnel[funnel.length - 1].commission}`;

    return {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Monthly Funnel*\n${funnelText}`
      }
    };
  }

  /**
   * Build conversion rates section
   */
  buildConversionSection(conversions) {
    let conversionText = '';
    Object.entries(conversions).forEach(([path, percentage]) => {
      conversionText += `• ${path}: *${percentage}%*\n`;
    });

    return {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Stage Conversion Rates*\n${conversionText}`
      }
    };
  }

  /**
   * Top performers by lead volume
   */
  buildTopPerformersByLeads(byRep) {
    if (byRep.length === 0) {
      return {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Top Performers (By Leads)*\nNo activity this month'
        }
      };
    }

    let tableText = '*Top Performers (By Leads Generated)*\n```';
    tableText += 'Rep                    | Leads | Meeting% | Aprovado% | Emissão% | R$ Value\n';
    tableText += '---                    | ----- | -------- | --------- | -------- | ---------\n';

    byRep.sort((a, b) => 
      (b.stages['Lead Entrou']?.count || 0) - (a.stages['Lead Entrou']?.count || 0)
    ).slice(0, 5).forEach(rep => {
      const leads = rep.stages['Lead Entrou']?.count || 0;
      const meetings = rep.stages['Reunião']?.count || 0;
      const aprovados = rep.stages['Aprovado']?.count || 0;
      const emissoes = rep.stages['Emissão']?.count || 0;
      const value = rep.stages['Emissão']?.value || 0;

      const meetingRate = leads > 0 ? ((meetings / leads) * 100).toFixed(0) : 0;
      const aprovadoRate = meetings > 0 ? ((aprovados / meetings) * 100).toFixed(0) : 0;
      const emissaoRate = aprovados > 0 ? ((emissoes / aprovados) * 100).toFixed(0) : 0;

      const repName = rep.rep.substring(0, 20).padEnd(20);
      tableText += `${repName} | ${leads} | ${meetingRate}% | ${aprovadoRate}% | ${emissaoRate}% | R$${value}\n`;
    });

    tableText += '```';

    return {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: tableText
      }
    };
  }

  /**
   * Top performers by revenue
   */
  buildTopPerformersByRevenue(byRep) {
    if (byRep.length === 0) {
      return {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Top Performers (By Revenue)*\nNo activity this month'
        }
      };
    }

    let tableText = '*Top Performers (By Revenue Generated)*\n```';
    tableText += 'Rep                    | R$ Revenue | Emissões | Avg Deal Value\n';
    tableText += '---                    | ---------- | -------- | -----\n';

    byRep.sort((a, b) => 
      (parseFloat(b.stages['Emissão']?.value || 0)) - (parseFloat(a.stages['Emissão']?.value || 0))
    ).slice(0, 5).forEach(rep => {
      const emissoes = rep.stages['Emissão']?.count || 0;
      const value = parseFloat(rep.stages['Emissão']?.value || 0);
      const avgDealValue = emissoes > 0 ? (value / emissoes).toFixed(0) : 0;

      const repName = rep.rep.substring(0, 20).padEnd(20);
      tableText += `${repName} | R$${value.toFixed(0)} | ${emissoes} | R$${avgDealValue}\n`;
    });

    tableText += '```';

    return {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: tableText
      }
    };
  }

  /**
   * Partner quality rankings
   */
  buildPartnerRankings(byPartner) {
    if (byPartner.length === 0) {
      return {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Partner Performance Rankings*\nNo activity this month'
        }
      };
    }

    let tableText = '*Partner Performance Rankings*\n```';
    tableText += 'Partner               | Leads | Approval% | Emissão% | Quality\n';
    tableText += '---                   | ----- | --------- | -------- | -------\n';

    byPartner.sort((a, b) => {
      const aEmissao = (a.stages['Emissão']?.count || 0) / (a.stages['Lead Entrou']?.count || 1);
      const bEmissao = (b.stages['Emissão']?.count || 0) / (b.stages['Lead Entrou']?.count || 1);
      return bEmissao - aEmissao;
    }).forEach(partner => {
      const leads = partner.stages['Lead Entrou']?.count || 0;
      const aprovados = partner.stages['Aprovado']?.count || 0;
      const emissoes = partner.stages['Emissão']?.count || 0;

      const approvalRate = leads > 0 ? ((aprovados / leads) * 100).toFixed(0) : 0;
      const emissaoRate = aprovados > 0 ? ((emissoes / aprovados) * 100).toFixed(0) : 0;

      // Quality score based on emissão rate
      const qualityScore = parseFloat(emissaoRate);
      let stars = '';
      if (qualityScore >= 80) stars = '⭐⭐⭐⭐⭐';
      else if (qualityScore >= 60) stars = '⭐⭐⭐⭐';
      else if (qualityScore >= 40) stars = '⭐⭐⭐';
      else if (qualityScore >= 20) stars = '⭐⭐';
      else stars = '⭐';

      const partnerName = partner.partner.substring(0, 21).padEnd(21);
      tableText += `${partnerName} | ${leads} | ${approvalRate}% | ${emissaoRate}% | ${stars}\n`;
    });

    tableText += '```';

    return {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: tableText
      }
    };
  }

  /**
   * Build forecast section
   */
  buildForecastSection(forecast) {
    const forecastText = `*Current Aprovados in Pipeline*: ${forecast.currentAprovados} deals (R$ ${forecast.currentAprovadoValue.toFixed(0)})\n` +
      `*Projected Emissões Next Month*: ~${forecast.projectedEmissaoCount} deals\n` +
      `*Projected Revenue (From Current Pipeline)*: R$ ${forecast.projectedEmissaoValue.toFixed(0)}\n` +
      `_(Based on ${forecast.conversionAssumption} conversion rate)_`;

    return {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Next Month Revenue Forecast*\n${forecastText}`
      }
    };
  }

  /**
   * Post to Slack
   */
  async postToSlack(message) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.webhookUrl);
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      };

      const req = https.request(url, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, data }));
      });

      req.on('error', reject);
      req.write(JSON.stringify(message));
      req.end();
    });
  }

  /**
   * Main execution
   */
  async generate() {
    try {
      const message = await this.generateSlackMessage();
      const result = await this.postToSlack(message);

      if (result.status === 200) {
        return {
          success: true,
          message: 'Monthly report posted to Slack'
        };
      } else {
        return {
          success: false,
          message: `Slack post failed: ${result.data}`
        };
      }
    } catch (error) {
      console.error('Error generating report:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }
}

module.exports = MonthlyReportGenerator;
