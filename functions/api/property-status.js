// Cloudflare Pages Function: /api/property-status
// Returns availability status for properties by checking Baserow lease data
// Requires BASEROW_API_TOKEN environment variable set in Pages project settings

export async function onRequestGet(context) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=300' // Cache 5 minutes
  };

  try {
    const token = context.env.BASEROW_API_TOKEN;
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing API token' }), { status: 500, headers });
    }

    const baseUrl = 'https://app.jadepropertiesgroup.com/api';

    // Get all properties with their status
    const propRes = await fetch(`${baseUrl}/database/rows/table/655/?user_field_names=true&size=10`, {
      headers: { 'Authorization': `Token ${token}` }
    });

    if (!propRes.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch properties' }), { status: 502, headers });
    }

    const propData = await propRes.json();
    const properties = propData.results.map(p => ({
      id: p.id,
      property_id: p.property_id,
      property_name: p.property_name,
      street_address: p.street_address,
      city: p.city,
      state: p.state,
      status: p.status ? p.status.value : null,
      zillow_listing_url: p.zillow_listing_url
    }));

    // Check active leases - status 2761 = Active
    const leaseRes = await fetch(`${baseUrl}/database/rows/table/658/?user_field_names=true&size=50&filter__status__single_select_equal=2761`, {
      headers: { 'Authorization': `Token ${token}` }
    });

    let activeLeases = [];
    if (leaseRes.ok) {
      const leaseData = await leaseRes.json();
      activeLeases = leaseData.results.map(l => ({
        property_ids: (l.property || []).map(p => p.id)
      }));
    }

    // Determine availability for each property
    const result = properties.map(p => {
      const hasActiveLease = activeLeases.some(l => l.property_ids.includes(p.id));
      // Available if: status is Vacant (or not Occupied) AND no active lease
      const available = !hasActiveLease && p.status !== 'Occupied';
      return {
        id: p.id,
        property_id: p.property_id,
        property_name: p.property_name,
        address: `${p.street_address}, ${p.city}, ${p.state}`,
        status: p.status,
        has_active_lease: hasActiveLease,
        available: available
      };
    });

    return new Response(JSON.stringify({ properties: result }), { status: 200, headers });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
}
