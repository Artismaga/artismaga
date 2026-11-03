BEGIN TRANSACTION;
-- Attachment also writes this asset row, closing concurrent reattachment races.
LET $asset_record=(SELECT * FROM media_asset WHERE uid=$asset AND purpose='chapter_cover')[0];
IF $asset_record!=NONE AND array::len(SELECT work FROM work_details WHERE value.nodes[WHERE cover=$asset] != [])=0 AND array::len(SELECT work FROM work_publication WHERE value.details.nodes[WHERE cover=$asset] != [])=0 {
    UPSERT type::record('storage_deletion',$asset) SET uid=$asset,provider=$asset_record.provider,object_key=$asset_record.object_key;
    DELETE media_asset WHERE uid=$asset;
};
DELETE chapter_cover_retirement WHERE uid=$asset;
COMMIT TRANSACTION;
