// Vercel Serverless Function: Dropea Logistics Automated Webhook Handler
// Trigger for Delivery Confirmation & Gated Digital Guide Dispatch

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sntsizmdhttpilbauxuv.supabase.co',
  'SUPABASE_SERVICE_KEY_REDACTED'
);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const payload = req.body || {};
    const eventType = payload.event || payload.status || 'STATUS_UPDATE';
    const orderNumber = payload.order_number || payload.order_id || payload.reference;
    const trackingId = payload.tracking_id || payload.tracking_number;
    const shippingStatus = payload.shipping_status || payload.status;

    // 1. Log incoming webhook
    await supabase.from('dropea_webhooks_log').insert({
      event_type: eventType,
      order_number: orderNumber,
      dropea_tracking_id: trackingId,
      shipping_status: shippingStatus,
      payload: payload,
      processed: true
    });

    // 2. If status is DELIVERED / ENTREGADO, trigger unlock of digital guides
    const isDelivered = (shippingStatus === 'DELIVERED' || shippingStatus === 'ENTREGADO' || eventType === 'ORDER_DELIVERED');
    
    if (isDelivered && orderNumber) {
      const { data, error } = await supabase.rpc('trigger_unlock_digital_guides', {
        target_order_number: orderNumber
      });

      return res.status(200).json({
        success: true,
        message: 'Dropea delivery processed. Digital guides unlocked automatically.',
        data: data
      });
    }

    // 3. If in transit, update tracking
    if (orderNumber && trackingId) {
      await supabase.from('orders').update({
        shipping_status: shippingStatus
      }).eq('order_number', orderNumber);
    }

    return res.status(200).json({
      success: true,
      message: 'Webhook received and recorded successfully.'
    });

  } catch (error) {
    console.error('Dropea Webhook Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
