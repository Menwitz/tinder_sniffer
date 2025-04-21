(function () {
    const originalFetch = window.fetch;
  
    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);
      const url = args[0];
  
      if (typeof url === "string" && url.includes("/v2/recs/core")) {
        response.clone().json().then(data => {
          const results = data?.data?.results || [];
  
          for (const profile of results) {
            try {
              const userId = profile.user._id;
              const name = profile.user.name;
              const photos = (profile.user.photos || []).map(p => p.url);
  
              console.groupCollapsed(`[${name}] (${userId})`);
              photos.forEach((url, i) => console.log(`Photo ${i + 1}:`, url));
              console.groupEnd();
  
              fetch("http://localhost:5050/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  userId: profile.user._id,
                  name: profile.user.name,
                  photos: profile.user.photos.map(p => p.url),
                  birth_date: profile.user.birth_date,
                  bio: profile.user.bio,
                  gender: profile.user.gender,
                  jobs: profile.user.jobs,
                  schools: profile.user.schools,
                  city: profile.user.city?.name || null,
                  distance: profile.distance_mi,
                  s_number: profile.s_number,
                  content_hash: profile.content_hash
                })
              }).then(res => {
                if (!res.ok) {
                  console.error("🚫 Backend error:", res.statusText);
                }
              }).catch(err => {
                console.error("🚫 Failed to send to backend:", err);
              });
  
            } catch (err) {
              console.error("❌ Failed to process profile:", err);
            }
          }
        }).catch(err => {
          console.error("❌ Failed to parse response:", err);
        });
      }
  
      return response;
    };
  })();
  