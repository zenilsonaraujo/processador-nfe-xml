document.getElementById('processBtn').addEventListener('click', processXML);

function generateEAN13(codigo, cfop, ncm) {
    // Garante que temos valores para trabalhar
    codigo = codigo || '000000';
    cfop = cfop || '0000';
    ncm = ncm || '00000000';
    
    // Combina os valores para formar a base do EAN
    let base = codigo.padStart(6, '0') + 
               cfop.padStart(4, '0') + 
               ncm.padStart(8, '0').substring(0, 2);
    
    // Garante que temos 12 dígitos
    base = base.padStart(12, '0').substring(0, 12);
    
    // Calcula o dígito verificador (EAN-13)
    let sum = 0;
    for (let i = 0; i < 12; i++) {
        const digit = parseInt(base[i]);
        sum += (i % 2 === 0) ? digit : digit * 3;
    }
    const checksum = (10 - (sum % 10)) % 10;
    
    return base + checksum.toString();
}

function processXML() {
    const fileInput = document.getElementById('xmlFile');
    const file = fileInput.files[0];
    
    if (!file) {
        showMessage('Por favor, selecione um arquivo XML.', 'error');
        return;
    }

    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const xmlContent = e.target.result;
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlContent, "text/xml");
            
            if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
                showMessage('Erro ao carregar o XML: ' + xmlDoc.getElementsByTagName("parsererror")[0].textContent, 'error');
                return;
            }
            
            processProducts(xmlDoc);
            
        } catch (error) {
            showMessage('Erro ao processar o XML: ' + error.message, 'error');
        }
    };
    
    reader.onerror = function() {
        showMessage('Erro ao ler o arquivo.', 'error');
    };
    
    reader.readAsText(file);
}

function normalizeCode(rawCode) {
    // Remove todos os caracteres não alfanuméricos e completa com zeros
    let cleanCode = rawCode.replace(/[^a-zA-Z0-9]/g, '');
    while (cleanCode.length < 6) {
        cleanCode = '0' + cleanCode;
    }
    return cleanCode.substring(0, 6);
}

function processProducts(xmlDoc) {
    const productsBody = document.getElementById('productsBody');
    productsBody.innerHTML = '';
    
    const nfeInfoDiv = document.getElementById('nfeInfo');
    nfeInfoDiv.innerHTML = '';
    
    const ns = "http://www.portalfiscal.inf.br/nfe";
    const itens = xmlDoc.getElementsByTagNameNS(ns, "det");
    
    if (itens.length === 0) {
        showMessage('Nenhum produto encontrado no XML.', 'error');
        return;
    }
    
    const codigosTracker = {};
    const duplicates = new Set();
    
    // Primeira passada: identificar duplicados
    for (let i = 0; i < itens.length; i++) {
        const produto = itens[i].getElementsByTagNameNS(ns, "prod")[0];
        if (!produto) continue;
        
        const rawCode = produto.getElementsByTagNameNS(ns, "cProd")[0]?.textContent || '';
        const codigo = normalizeCode(rawCode);
        
        if (codigo in codigosTracker) {
            codigosTracker[codigo].count++;
            codigosTracker[codigo].lines.push(i);
            duplicates.add(codigo);
        } else {
            codigosTracker[codigo] = { 
                count: 1, 
                lines: [i],
                rawCode: rawCode 
            };
        }
    }
    
    const nfeData = {
        numero: xmlDoc.getElementsByTagNameNS(ns, "nNF")[0]?.textContent || '',
        serie: xmlDoc.getElementsByTagNameNS(ns, "serie")[0]?.textContent || '',
        dataEmissao: xmlDoc.getElementsByTagNameNS(ns, "dhEmi")[0]?.textContent || '',
        emitente: xmlDoc.getElementsByTagNameNS(ns, "xNome")[0]?.textContent || ''
    };
    
    const nfeInfo = document.createElement('div');
    nfeInfo.className = 'nfe-info';
    nfeInfo.innerHTML = `
        <h3>Informações da NFe</h3>
        <p><strong>Número:</strong> ${nfeData.numero}</p>
        <p><strong>Série:</strong> ${nfeData.serie}</p>
        <p><strong>Data Emissão:</strong> ${formatDate(nfeData.dataEmissao)}</p>
        <p><strong>Emitente:</strong> ${nfeData.emitente}</p>
        ${duplicates.size > 0 ? `<p class="warning"><strong>Atenção:</strong> ${duplicates.size} códigos duplicados encontrados</p>` : ''}
    `;
    nfeInfoDiv.appendChild(nfeInfo);
    
    // Segunda passada: criar a tabela
    for (let i = 0; i < itens.length; i++) {
        const item = itens[i];
        const produto = item.getElementsByTagNameNS(ns, "prod")[0];
        if (!produto) continue;
        
        const rawCode = produto.getElementsByTagNameNS(ns, "cProd")[0]?.textContent || '';
        const codigo = normalizeCode(rawCode);
        let ean = produto.getElementsByTagNameNS(ns, "cEAN")[0]?.textContent || '';
        const ncm = produto.getElementsByTagNameNS(ns, "NCM")[0]?.textContent || '';
        const cfop = produto.getElementsByTagNameNS(ns, "CFOP")[0]?.textContent || '';
        
        // Gerar EAN13 quando for SEM GTIN
        let isGeneratedEan = false;
        if (ean === 'SEM GTIN' || ean === '') {
            ean = generateEAN13(rawCode, cfop, ncm);
            isGeneratedEan = true;
        }
        
        // Descrição completa
        const descricaoPrincipal = produto.getElementsByTagNameNS(ns, "xProd")[0]?.textContent || '';
        const infAdProd = item.getElementsByTagNameNS(ns, "infAdProd")[0]?.textContent || '';
        const descricaoCompleta = [descricaoPrincipal, infAdProd]
            .filter(Boolean)
            .join(' - ');
        
        const row = document.createElement('tr');
        
        // Verifica se é duplicado
        const isDuplicate = duplicates.has(codigo) && codigosTracker[codigo].lines[0] !== i;
        if (isDuplicate) {
            row.classList.add('duplicate');
            row.title = `Código duplicado: ${codigo} (original na linha ${codigosTracker[codigo].lines[0] + 1})`;
        }
        
        // Células da tabela
        const codigoCell = document.createElement('td');
        codigoCell.textContent = codigo;
        row.appendChild(codigoCell);
        
        const eanCell = document.createElement('td');
        eanCell.textContent = ean;
        if (isGeneratedEan) {
            eanCell.classList.add('generated-ean');
        }
        row.appendChild(eanCell);
        
        const descricaoCell = document.createElement('td');
        descricaoCell.textContent = descricaoCompleta;
        row.appendChild(descricaoCell);
        
        const ncmCell = document.createElement('td');
        ncmCell.textContent = ncm;
        row.appendChild(ncmCell);
        
        productsBody.appendChild(row);
    }
    
    if (duplicates.size > 0) {
        showMessage(`Processamento concluído. ${duplicates.size} códigos duplicados encontrados (cópias em amarelo).`, 'warning');
    } else {
        showMessage('Processamento concluído. Nenhum código duplicado encontrado.', 'success');
    }
}

function formatDate(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR');
    } catch (e) {
        return dateString;
    }
}

function showMessage(message, type) {
    const messageDiv = document.getElementById('message');
    messageDiv.textContent = message;
    messageDiv.className = type;
    messageDiv.scrollIntoView({ behavior: 'smooth' });
}
