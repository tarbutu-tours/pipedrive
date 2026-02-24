import axios from 'axios';
import { config } from '../config.js';

const baseUrl = config.pipedrive?.apiToken && config.pipedrive?.domain
  ? `https://${config.pipedrive.domain}.pipedrive.com/api/v1`
  : null;

export async function createPersonAndDeal({ name, phone, utm_source, utm_medium, utm_campaign, chatSummary }) {
  if (!baseUrl || !config.pipedrive.apiToken) return { personId: null, dealId: null };
  try {
    const params = { api_token: config.pipedrive.apiToken };
    const personRes = await axios.post(`${baseUrl}/persons`, {
      name,
      phone: [{ value: phone, primary: true, label: 'work' }],
    }, { params });
    const personId = personRes.data?.data?.id;
    if (!personId) return { personId: null, dealId: null };

    const noteBody = [
      chatSummary && `Chat summary: ${chatSummary}`,
      utm_source && `UTM source: ${utm_source}`,
      utm_medium && `UTM medium: ${utm_medium}`,
      utm_campaign && `UTM campaign: ${utm_campaign}`,
    ].filter(Boolean).join('\n');

    if (noteBody) {
      await axios.post(`${baseUrl}/notes`, {
        person_id: personId,
        content: noteBody,
      }, { params });
    }

    const dealRes = await axios.post(`${baseUrl}/deals`, {
      title: `Lead: ${name} - ${config.agencyName} Chat`,
      person_id: personId,
      status: 'open',
    }, { params });
    const dealId = dealRes.data?.data?.id || null;
    return { personId, dealId };
  } catch (err) {
    console.error('Pipedrive error:', err.response?.data || err.message);
    return { personId: null, dealId: null };
  }
}
