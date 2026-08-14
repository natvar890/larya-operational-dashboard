/**
 * LARYA Weekly Operational Report
 * Runs: Friday 9 AM America/Sao_Paulo
 * Reports: Previous week funnel (Mon-Sun)
 */

const https = require('https');
const { DateTime } = require('luxon');
const DashboardData = require('./dashboard-data-queries');

class WeeklyReportGenerator {
  constructor(apiKey, webhookUrl, timezone = 'America/Sao_Paulo') {
    this.dashboardData = new DashboardData(apiKey);
    this.webhookUrl = webhookUrl;
    this.timezone = timezone;
  }

  /**
   * Get previous week date range (Monday-Sunday)
   */
  getPreviousWeekRange() {
    const now = DateTime.now().setZone(this.timezone);
    const startOfThisWeek = now.startOf('week');
    const startOfLastWeek = startOfThisWeek.minus({ weeks: 1 });
    const endOfLastWeek = startOfLastWeek.endOf('week');

    return {
      start: startOfLastWeek.toISO(),
      end: endOfLastWeek.toISO(),
      displayStart: startOfLastWeek.toFormat('dd/MM/yyyy'),
      displayEnd: endOfLastWeek.toFormat('dd/MM/yyyy')
    };
  }

  /**
   * Generate formatted Slack message for weekly report
   */
  async generateSlackMessage() {
    try {
      const dateRange = this.getPreviousWeekRange();
      const funnel = await this.dashboardData.buildFunnel(dateRange.start, dateRange.end);
      const forecast = await this.dashboardData.calculateForecast();
      const formatted = this.dashboardData.formatFunnelForDisplay(funnel);

      const blocks = [];

      // Header
      blocks.push({
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📊 LARYA Weekly Report - ${dateRange.displayStart} to ${dateRange.displayEnd}`,
          emoji: true
        }
      });

      // Funnel overview
      blocks.push(this.buildFunnelSection(formatted.funnel));

      // Conversions
      blocks.push(this.buildConversionSection(funnel.conversions));

      // By Rep
      blocks.push({
        type: 'divider'
      });
      blocks.push(this.buildByRepSection(formatted.byRep));

      // By Partner
      blocks.push({
        type: 'divider'
      });
      blocks.push(this.buildByPartnerSection(formatted.byPartner));

      // Forecast
      if (forecast) {
        blocks.push({
          type: 'divider'
        });
        blocks.push(this.buildForecastSection(forecast));
      }

      return { blocks };
    } catch (error) {
      console.error('Error generating weekly report:', error);
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

    funnelText += `\n*Total Value Closed*: R$ ${funnel[funnel.length - 1].value}`;

    return {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Weekly Funnel*\n${funnelText}`
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
        text: `*Conversion Rates*\n${conversionText}`
      }
    };
  }

  /**
   * Build by-rep performance table
   */
  buildByRepSection(byRep) {
    if (byRep.length === 0) {
      return {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*By Sales Rep*\nNo activity this week'
        }
      };
    }

    let tableText = '*By Sales Rep*\n```';
    tableText += 'Rep                    | Leads | Meeting% | Aprovado% | Value\n';
    tableText += '---                    | ----- | -------- | --------- | -----\n';

    byRep.sort((a, b) => 
      (b.stages['Lead Entrou']?.count || 0) - (a.stages['Lead Entrou']?.count || 0)
    ).forEach(rep => {
      const leads = rep.stages['Lead Entrou']?.count || 0;
      const meetings = rep.stages['Reunião']?.count || 0;
      const aprovados = rep.stages['Aprovado']?.count || 0;
      const value = rep.stages['Emissão']?.value || 0;

      const meetingRate = leads > 0 ? ((meetings / leads) * 100).toFixed(0) : 0;
      const aprovadoRate = meetings > 0 ? ((aprovados / meetings) * 100).toFixed(0) : 0;

      const repName = rep.rep.substring(0, 20).padEnd(20);
      tableText += `${repName} | ${leads} | ${meetingRate}% | ${aprovadoRate}% | R$${value}\n`;
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
   * Build by-partner performance section
   */
  buildByPartnerSection(byPartner) {
    if (byPartner.length === 0) {
      return {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*By Partner/Source*\nNo activity this week'
        }
      };
    }

    let tableText = '*By Partner/Source*\n```';
    tableText += 'Partner               | Leads | Approval% | Emissão% | Value\n';
    tableText += '---                   | ----- | --------- | -------- | -----\n';

    byPartner.sort((a, b) => 
      (b.stages['Lead Entrou']?.count || 0) - (a.stages['Lead Entrou']?.count || 0)
    ).forEach(partner => {
      const leads = partner.stages['Lead Entrou']?.count || 0;
      const aprovados = partner.stages['Aprovado']?.count || 0;
      const emissoes = partner.stages['Emissão']?.count || 0;
      const value = partner.stages['Emissão']?.value || 0;

      const approvalRate = leads > 0 ? ((aprovados / leads) * 100).toFixed(0) : 0;
      const emissaoRate = aprovados > 0 ? ((emissoes / aprovados) * 100).toFixed(0) : 0;

      const partnerName = partner.partner.substring(0, 21).padEnd(21);
      tableText += `${partnerName} | ${leads} | ${approvalRate}% | ${emissaoRate}% | R$${value}\n`;
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
    const forecastText = `*Current Aprovados*: ${forecast.currentAprovados} deals (R$ ${forecast.currentAprovadoValue.toFixed(0)})\n` +
      `*Projected Emissões Next Month*: ~${forecast.projectedEmissaoCount} deals\n` +
      `*Projected Revenue*: R$ ${forecast.projectedEmissaoValue.toFixed(0)}\n` +
      `_(Based on ${forecast.conversionAssumption} conversion rate)_`;

    return {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Revenue Forecast*\n${forecastText}`
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
          message: 'Weekly report posted to Slack'
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

module.exports = WeeklyReportGenerator;
