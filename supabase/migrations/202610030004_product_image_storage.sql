-- Supabase Storage only; test harness uses a separate emulation of its schema.
-- Public objects are re-encoded WebP images, uploaded by the server only.
-- Rollback: disable upload route; preserve already referenced objects.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('course-product-images','course-product-images',true,2097152,array['image/webp']);
-- Restrictive policy also blocks this bucket if another existing permissive
-- policy grants broad user writes. Privileged server is the sole uploader.
create policy course_images_server_only on storage.objects as restrictive for all to anon,authenticated
using(bucket_id<>'course-product-images') with check(bucket_id<>'course-product-images');
commit;
