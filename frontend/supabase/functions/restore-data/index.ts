import { isAccommodationAdmin, resolveCaller } from '../_shared/authz.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RestoreRequest {
  accommodationId: string;
  filePath: string;
  clearExisting?: boolean;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authRes = await resolveCaller(req);
    if (!authRes.ok) {
      return new Response(JSON.stringify({ error: authRes.error }), {
        status: authRes.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = authRes.ctx.admin;

    const { accommodationId, filePath, clearExisting = false }: RestoreRequest = await req.json();

    if (!accommodationId || !filePath) {
      throw new Error('Missing accommodationId or filePath');
    }

    // Verify user has admin access to this accommodation using the shared model
    if (!(await isAccommodationAdmin(authRes.ctx, accommodationId))) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Starting restore for accommodation: ${accommodationId}, file: ${filePath}`);

    // Download backup file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('backups')
      .download(filePath);

    if (downloadError) {
      throw new Error(`Failed to download backup: ${downloadError.message}`);
    }

    console.log(`Downloaded backup file: ${filePath}, size: ${fileData.size} bytes`);

    // Check if file is gzip compressed (by file extension or content-type)
    const isCompressed = filePath.endsWith('.gz') || filePath.endsWith('.gzip');
    
    let backupText: string;
    
    if (isCompressed) {
      console.log('Decompressing gzip file...');
      // Decompress the data
      const compressedBuffer = await fileData.arrayBuffer();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(compressedBuffer));
          controller.close();
        }
      });
      
      const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
      const decompressedBlob = await new Response(decompressedStream).blob();
      backupText = await decompressedBlob.text();
      console.log('Decompression complete');
    } else {
      console.log('Reading uncompressed file...');
      backupText = await fileData.text();
    }

    // Parse backup data
    const backupData = JSON.parse(backupText);

    if (!backupData.data || !backupData.accommodationId) {
      throw new Error('Invalid backup file format');
    }

    if (backupData.accommodationId !== accommodationId) {
      throw new Error('Backup file accommodation ID does not match requested accommodation');
    }

    console.log(`Backup file contains ${backupData.metadata.ordersCount} orders and ${backupData.metadata.customersCount} customers`);
    
    // Check if this is an incremental backup
    const isIncremental = backupData.backupMode === 'incremental';
    console.log(`Backup mode: ${isIncremental ? 'incremental' : 'full'}`);

    let restoredOrders = 0;
    let restoredCustomers = 0;

    // For incremental backups, we merge data instead of clearing
    // For full backups, we can optionally clear existing data
    if (!isIncremental && clearExisting) {
      console.log('Clearing existing data...');
      
      const { error: deleteOrdersError } = await supabase
        .from('orders')
        .delete()
        .eq('accommodation_id', accommodationId);

      if (deleteOrdersError) {
        console.error('Error deleting orders:', deleteOrdersError);
      }

      const { error: deleteCustomersError } = await supabase
        .from('customers')
        .delete()
        .eq('accommodation_id', accommodationId);

      if (deleteCustomersError) {
        console.error('Error deleting customers:', deleteCustomersError);
      }
    }

    // Restore customers first (as orders may reference them)
    if (backupData.data.customers && backupData.data.customers.length > 0) {
      const { error: customersError } = await supabase
        .from('customers')
        .upsert(backupData.data.customers, {
          onConflict: 'id',
        });

      if (customersError) {
        console.error('Error restoring customers:', customersError);
      } else {
        restoredCustomers = backupData.data.customers.length;
        console.log(`Restored ${restoredCustomers} customers`);
      }
    }

    // Restore orders
    if (backupData.data.orders && backupData.data.orders.length > 0) {
      const { error: ordersError } = await supabase
        .from('orders')
        .upsert(backupData.data.orders, {
          onConflict: 'id',
        });

      if (ordersError) {
        console.error('Error restoring orders:', ordersError);
      } else {
        restoredOrders = backupData.data.orders.length;
        console.log(`Restored ${restoredOrders} orders`);
      }
    }

    // Update backup log status
    const { error: updateLogError } = await supabase
      .from('backup_logs')
      .update({ 
        status: 'restored',
        updated_at: new Date().toISOString(),
      })
      .eq('file_path', filePath);

    if (updateLogError) {
      console.error('Failed to update backup log:', updateLogError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `${isIncremental ? 'Incremental' : 'Full'} backup restored successfully`,
        restored: {
          ordersCount: restoredOrders,
          customersCount: restoredCustomers,
          backupTimestamp: backupData.timestamp,
          backupMode: backupData.backupMode || 'full',
          incrementalSince: backupData.incrementalSince,
          clearExisting,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Restore error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
