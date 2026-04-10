// Simple WhatsApp Business API client for sending messages



interface SendMessageParams {
  to: string
  message: string
}

export async function sendWhatsAppMessage({ to, message }: SendMessageParams) {
  // Get environment variables for WhatsApp API
  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v22.0'
  const phoneNumberId = process.env.WHATSAPP_BUSINESS_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN

  // Check if required environment variables are set
  if (!phoneNumberId || !accessToken) {
    return false
  }

  // WhatsApp Business API endpoint
  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`

  // Message payload following WhatsApp API format
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'text',
    text: {
      body: message,
    },
  }

  try {
    // Send message via WhatsApp Business API
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    })

    const result = await response.json()

    if (response.ok) {
      console.log(`✅ WhatsApp message sent to ${to}: "${message}"`)
      return true
    } else {
      console.error('❌ Failed to send WhatsApp message:', result)
      return false
    }
  } catch (error) {
    console.error('❌ Error sending WhatsApp message:', error)
    return false
  }
}