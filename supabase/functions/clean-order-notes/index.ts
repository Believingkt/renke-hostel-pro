import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { accommodationId } = await req.json();

    if (!accommodationId) {
      return new Response(
        JSON.stringify({ error: 'Missing accommodationId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user has admin role for this accommodation
    const { data: userRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('accommodation_id', accommodationId)
      .single();

    if (rolesError || !userRoles || !['super_admin', 'hotel_admin'].includes(userRoles.role)) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting to clean order notes for accommodation: ${accommodationId}`);

    // Fetch all orders for this accommodation that have notes
    const { data: orders, error: fetchError } = await supabase
      .from('orders')
      .select('id, notes')
      .eq('accommodation_id', accommodationId)
      .not('notes', 'is', null);

    if (fetchError) {
      console.error('Error fetching orders:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch orders' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!orders || orders.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: 'No orders with notes found',
          updatedCount: 0 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let updatedCount = 0;
    const errors = [];

    // Process each order
    for (const order of orders) {
      if (!order.notes) continue;

      // Remove the 【加購方案】 section from notes
      // This regex matches the section starting with 【加購方案】 and all content until the end or another section
      const cleanedNotes = order.notes
        .replace(/\n*【加購方案】\n[\s\S]*?(?=\n\n【|$)/g, '')
        .trim();

      // Only update if the notes actually changed
      if (cleanedNotes !== order.notes) {
        const { error: updateError } = await supabase
          .from('orders')
          .update({ notes: cleanedNotes || null })
          .eq('id', order.id);

        if (updateError) {
          console.error(`Error updating order ${order.id}:`, updateError);
          errors.push({ orderId: order.id, error: updateError.message });
        } else {
          updatedCount++;
          console.log(`Updated order ${order.id}`);
        }
      }
    }

    console.log(`Completed cleaning. Updated ${updatedCount} orders`);

    return new Response(
      JSON.stringify({ 
        message: `Successfully cleaned order notes`,
        updatedCount,
        totalChecked: orders.length,
        errors: errors.length > 0 ? errors : undefined
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in clean-order-notes function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
