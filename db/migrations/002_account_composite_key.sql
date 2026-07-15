ALTER TABLE nexon_accounts DROP CONSTRAINT IF EXISTS nexon_accounts_pkey;
ALTER TABLE nexon_accounts DROP CONSTRAINT IF EXISTS nexon_accounts_user_id_id_key;
ALTER TABLE nexon_accounts ADD PRIMARY KEY (user_id, id);
