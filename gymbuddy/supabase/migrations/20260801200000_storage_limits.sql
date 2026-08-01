-- Bucket profile-photos nie mial zadnego limitu rozmiaru ani whitelisty typow —
-- posiadacz waznego JWT mogl wrzucac do swojego folderu pliki dowolnej wielkosci
-- i typu (koszty egress + potencjalny hosting smieci). Domykamy:
--  - limit 30 MB (wideo statusu do 20 MB + zapas na metadane)
--  - tylko obrazy / wideo / audio (glosowki)
update storage.buckets
set file_size_limit = 31457280,  -- 30 MB
    allowed_mime_types = array[
      'image/jpeg','image/png','image/webp','image/heic','image/heif',
      'video/mp4','video/quicktime',
      'audio/mp4','audio/m4a','audio/aac','audio/mpeg'
    ]
where id = 'profile-photos';
