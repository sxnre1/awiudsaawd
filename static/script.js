const form = document.getElementById('discordForm');
const textarea = form.querySelector('textarea');
const toast = document.getElementById('toast');
const previewContainer = document.getElementById('previewContainer');
const historyContainer = document.getElementById('historyContainer');
const toggleHistoryBtn = document.getElementById('toggleHistory');
const imageModal = document.getElementById('imageModal');
const modalImg = document.getElementById('modalImg');
const autocompleteList = document.getElementById('autocompleteList');

let clipboardImages = [];
let history = [];
let currentMentionType = null;

function showToast(message, success=true){
    toast.textContent = message;
    toast.style.backgroundColor = success ? '#4CAF50' : '#D32F2F';
    
    toast.classList.add('show');

    setTimeout(()=>{
        toast.classList.remove('show');
    }, 3000);
}

function renderPreviews(){
    previewContainer.innerHTML = '';
    clipboardImages.forEach((file, idx)=>{
        const div = document.createElement('div');
        div.style.position='relative';
        div.style.width='80px';
        div.style.height='80px';
        div.style.border='1px solid #555';
        div.style.borderRadius='5px';
        div.style.overflow='hidden';
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.style.width='100%';
        img.style.height='100%';
        img.style.objectFit='cover';
        const del = document.createElement('span');
        del.textContent='✖';
        del.style.position='absolute';
        del.style.top='2px';
        del.style.right='4px';
        del.style.cursor='pointer';
        del.style.color='white';
        del.style.backgroundColor='rgba(0,0,0,0.5)';
        del.style.borderRadius='50%';
        del.style.fontSize='14px';
        del.addEventListener('click', ()=>{ clipboardImages.splice(idx,1); renderPreviews(); });
        div.appendChild(img); div.appendChild(del);
        previewContainer.appendChild(div);
    });
}

function renderHistory(){
    historyContainer.innerHTML='';
    history.forEach(entry=>{
        const div=document.createElement('div');
        div.style.borderBottom='1px solid #555';
        div.style.padding='6px 0';
        const text=document.createElement('div');
        text.textContent=entry.message;
        div.appendChild(text);
        entry.files.forEach(file=>{
            const img=document.createElement('img');
            img.src = URL.createObjectURL(file);
            img.addEventListener('click', ()=>{
                modalImg.src = img.src;
                imageModal.classList.add('show');
            });
            div.appendChild(img);
        });
        historyContainer.appendChild(div);
    });
}

toggleHistoryBtn.addEventListener('click', ()=>{
    if(historyContainer.classList.contains('open')){
        historyContainer.classList.remove('open');
        toggleHistoryBtn.textContent='히스토리 보기';
    } else {
        historyContainer.classList.add('open');
        renderHistory();
        toggleHistoryBtn.textContent='히스토리 닫기';
    }
});

textarea.addEventListener('paste', (e)=>{
    const items = e.clipboardData.items;
    for(let i=0;i<items.length;i++){
        const item = items[i];
        if(item.type.indexOf("image")!==-1){
            const file = item.getAsFile();
            clipboardImages.push(file);
        }
    }
    renderPreviews();
});

async function sendMessage(){
    if(!textarea.value && clipboardImages.length===0){
        showToast('메시지 또는 이미지 필요 ❌', false);
        return;
    }
    const data = new FormData();
    data.append('message', textarea.value);
    clipboardImages.forEach(file=>data.append('file', file));
    try{
        const res = await fetch('/send',{method:'POST', body:data});
        const result = await res.json();
        if(result.success){
            showToast(result.message || '메시지 전송 성공 ✅', true);
            history.unshift({message:textarea.value, files:[...clipboardImages]});
            textarea.value=''; clipboardImages=[]; renderPreviews();
            if(historyContainer.classList.contains('open')) renderHistory();
        } else {
            showToast('전송 실패 ❌\n'+JSON.stringify(result.error), false);
        }
    } catch(err){ showToast('오류 발생 ❌\n'+err, false); }
}

textarea.addEventListener('keydown', (e)=>{
    if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); sendMessage(); }
    handleAutocomplete(e);
});

form.addEventListener('submit',(e)=>{ e.preventDefault(); sendMessage(); });

function closeModal(){
    imageModal.classList.remove('show');
    setTimeout(()=>{ modalImg.src=''; }, 300);
}
imageModal.addEventListener('click', closeModal);
document.addEventListener('keydown', (e)=>{
    if(e.key==="Escape" && imageModal.classList.contains('show')) closeModal();
});

let autocompleteTimeout = null;

function handleAutocomplete(e){
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = textarea.value.slice(0, cursorPos);
    const match = textBeforeCursor.match(/(@|#)(\S*)?$/);
    if(match){
        currentMentionType = match[1]==="@" ? "user" : "channel";
        const query = match[2] || "";
        if(autocompleteTimeout) clearTimeout(autocompleteTimeout);
        autocompleteTimeout = setTimeout(async ()=>{
            try{
                const resp = await fetch(`/autocomplete?type=${currentMentionType}&q=${encodeURIComponent(query)}`);
                const data = await resp.json();
                autocompleteList.innerHTML='';
                if(data.success && data.results.length){
                    data.results.forEach(r=>{
                        const div=document.createElement('div');
                        div.textContent=r.name;
                        div.addEventListener('click', ()=>{
                            const start = textBeforeCursor.lastIndexOf(currentMentionType);
                            const mentionSyntax = currentMentionType==='@' ? `<@${r.id}>` : `<#${r.id}>`;
                            textarea.value = textarea.value.slice(0,start)+mentionSyntax+' '+textarea.value.slice(cursorPos);
                            textarea.focus();
                            autocompleteList.style.display='none';
                        });
                        autocompleteList.appendChild(div);
                    });
                    autocompleteList.style.display='block';
                } else {
                    autocompleteList.style.display='none';
                }
            } catch(err){ autocompleteList.style.display='none'; }
        }, 100);
    } else {
        autocompleteList.style.display='none';
        currentMentionType=null;
    }
}