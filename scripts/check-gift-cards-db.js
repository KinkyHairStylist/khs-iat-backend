const { Client } = require('pg');
const c = new Client({ host:'localhost', port:5432, user:'postgres', password:'Htcode12', database:'postgres' });
(async()=>{
  await c.connect();
  const s = await c.query('SELECT id, title, amount, template, description, "soldStatus", "status" FROM business_gift_cards WHERE "soldStatus"=\'available\' AND "status"=\'Active\'');
  console.table(s.rows);
  await c.end();
})();
