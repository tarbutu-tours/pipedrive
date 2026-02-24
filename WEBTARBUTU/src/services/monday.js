import axios from 'axios';
import { config } from '../config.js';

const MONDAY_API = 'https://api.monday.com/v2';
const apiKey = config.monday?.apiKey;
const boardId = config.monday?.boardId;

// Optional: set MONDAY_COLUMN_DESCRIPTION and MONDAY_COLUMN_PHONE to your board column IDs (e.g. text0)
const columnIdDescription = process.env.MONDAY_COLUMN_DESCRIPTION;
const columnIdPhone = process.env.MONDAY_COLUMN_PHONE;

export async function createSupportItem({ phone, issueDescription }) {
  if (!apiKey || !boardId) return null;
  try {
    const itemName = `Support: ${phone || 'No phone'} - ${new Date().toLocaleString('he-IL')}`;
    const columnValuesObj = {};
    if (columnIdDescription) columnValuesObj[columnIdDescription] = issueDescription || 'Support request from chat';
    if (columnIdPhone) columnValuesObj[columnIdPhone] = { phone: phone || '', countryShortName: 'IL' };
    const query = `
      mutation ($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
        create_item (board_id: $boardId, item_name: $itemName, column_values: $columnValues) {
          id
        }
      }
    `;
    const columnValues = Object.keys(columnValuesObj).length ? JSON.stringify(columnValuesObj) : '{}';
    const variables = {
      boardId: Number(boardId),
      itemName,
      columnValues,
    };
    const res = await axios.post(
      MONDAY_API,
      { query, variables },
      { headers: { 'Content-Type': 'application/json', Authorization: apiKey } }
    );
    const id = res.data?.data?.create_item?.id;
    return id ? parseInt(id, 10) : null;
  } catch (err) {
    console.error('Monday.com error:', err.response?.data || err.message);
    return null;
  }
}
