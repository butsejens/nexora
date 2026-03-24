const leagues = ['ned.1','esp.1','por.1','ita.1','ita.2','ned.2'];
Promise.all(leagues.map(l=>fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/'+l+'/teams').then(r=>r.json()))).then(results=>{
  results.forEach((data,i)=>{
    console.log('=== '+leagues[i]+' ===');
    (data.sports?.[0]?.leagues?.[0]?.teams||[]).forEach(e=>{
      const t=e.team;
      console.log(t.id+'  '+t.displayName);
    });
  });
}).catch(e=>console.error(e));
