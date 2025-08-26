// ==UserScript==
// @name         MissKon Auto Load Next Page
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  自动加载下一页内容和图片 - 专为MissKon网站优化
// @author       mr.p@email
// @match        *://misskon.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    // 配置参数
    const config = {
        // 需要监听滚动的容器元素选择器
        containerSelector: 'body',
        // 下一页按钮的选择器（多种可能的选择器）
        nextPageSelectors: [
            '.page-link a.post-page-numbers:not(.current)',
            '.post-page-numbers:not(.current)',
            'a.page-numbers:not(.current)',
            '.wp-pagenavi a:not(.current)',
            '.pagination-next',
            '.next'
        ],
        // 分页数字选择器
        pageNumbersSelectors: [
            '.page-link .post-page-numbers',
            '.post-page-numbers',
            '.page-numbers',
            '.wp-pagenavi a',
            '.pagination a'
        ],
        // 内容容器的选择器（多种可能的选择器）
        contentSelectors: [
            '.entry',
            '.post-inner',
            '.post-content',
            '.content',
            'article',
            '.entry-content',
            'main'
        ],
        // 滚动到页面高度的百分比时触发加载（0.85表示85%）
        scrollThresholdPercent: 0.85,
        // 检查间隔（毫秒）
        checkInterval: 1500,
        // 图片选择器（多种可能的选择器）
        imageSelectors: [
            'img.aligncenter.lazy:not(.loaded)',
            'img.lazy:not(.loaded)',
            'img[data-src]:not(.loaded)',
            'img[data-original]:not(.loaded)',
            'img[loading="lazy"]:not(.loaded)'
        ],
        // 是否启用连续加载（加载完一页后自动检查并加载下一页）
        continuousLoading: true,
        // 是否自动探测总页数（如果为false，则使用maxPageNumber作为总页数）
        autoDetectTotalPages: true,
        // 最大页数（如果autoDetectTotalPages为false，则使用此值作为总页数）
        maxPageNumber: 50,
        // 延迟加载时间（毫秒）
        loadDelay: 1500,
        // 页面分隔符样式
        separatorStyle: {
            textAlign: 'center',
            padding: '25px 20px',
            margin: '30px 0',
            background: 'linear-gradient(90deg, #f8f9fa 0%, #e9ecef 50%, #f8f9fa 100%)',
            border: '2px solid #e74c3c',
            borderRadius: '8px',
            fontSize: '18px',
            fontWeight: 'bold',
            color: '#e74c3c',
            boxShadow: '0 4px 6px rgba(231, 76, 60, 0.1)'
        }
    };

    // 状态标记
    let isLoading = false;
    let checkTimer = null;
    // 页面计数器
    let currentPageNumber = 1;
    // 总页数
    let totalPageNumber = null;
    // 状态显示元素
    let statusElement = null;
    // 是否已完成所有页面加载
    let allPagesLoaded = false;

    // 添加状态显示样式
    GM_addStyle(`
        #auto-load-status {
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 10px 15px;
            border-radius: 5px;
            font-size: 14px;
            z-index: 10000;
            max-width: 300px;
            word-wrap: break-word;
        }
        #auto-load-status.loading {
            background: rgba(0, 100, 200, 0.8);
        }
        #auto-load-status.error {
            background: rgba(200, 0, 0, 0.8);
        }
        #auto-load-status.success {
            background: rgba(0, 150, 0, 0.8);
        }
    `);

    // 创建状态显示元素
    function createStatusElement() {
        if (!statusElement) {
            statusElement = document.createElement('div');
            statusElement.id = 'auto-load-status';
            statusElement.style.display = 'none';
            document.body.appendChild(statusElement);
        }
        return statusElement;
    }

    // 显示状态信息
    function showStatus(message, type = 'info', duration = 3000) {
        const status = createStatusElement();
        status.textContent = message;
        status.className = type;
        status.style.display = 'block';
        
        if (duration > 0) {
            setTimeout(() => {
                status.style.display = 'none';
            }, duration);
        }
    }

    // 通用选择器查找函数
    function findElement(selectors) {
        if (typeof selectors === 'string') {
            return document.querySelector(selectors);
        }
        
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
                return element;
            }
        }
        return null;
    }

    // 通用选择器查找所有元素函数
    function findElements(selectors) {
        if (typeof selectors === 'string') {
            return document.querySelectorAll(selectors);
        }
        
        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            if (elements && elements.length > 0) {
                return elements;
            }
        }
        return document.querySelectorAll(''); // 返回空的NodeList
    }

    // 处理页面可见性变化
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible') {
            startAutoCheck();
        } else {
            stopAutoCheck();
        }
    });

    // 启动定时检查
    function startAutoCheck() {
        // 如果已经加载完所有页面，不启动检查
        if (allPagesLoaded) {
            return;
        }
        
        if (!checkTimer) {
            // 先探测总页数
            detectTotalPages();

            checkTimer = setInterval(function() {
                if (!allPagesLoaded && isNearBottom()) {
                    loadNextPage();
                }
            }, config.checkInterval);
        }
    }

    // 探测总页数和分页URL
    function detectTotalPages() {
        try {
            // 直接从 .page-link 容器中获取所有分页信息
            const pageLinksContainer = document.querySelector('.page-link');
            if (!pageLinksContainer) {
                totalPageNumber = config.maxPageNumber;
                showStatus(`未找到分页导航，使用默认最大页数: ${totalPageNumber}`, 'info', 2000);
                return;
            }

            // 获取所有分页链接
            const pageLinks = pageLinksContainer.querySelectorAll('.post-page-numbers');
            const pageUrls = new Map(); // 存储页码和对应的URL
            let maxPage = 1;
            let currentPage = 1;

            pageLinks.forEach(link => {
                const pageText = link.textContent.trim();
                const pageNum = parseInt(pageText);
                
                if (!isNaN(pageNum)) {
                    if (link.classList.contains('current')) {
                        currentPage = pageNum;
                    } else if (link.href) {
                        pageUrls.set(pageNum, link.href);
                    }
                    
                    if (pageNum > maxPage) {
                        maxPage = pageNum;
                    }
                }
            });

            // 更新全局变量
            currentPageNumber = currentPage;
            totalPageNumber = maxPage;
            
            // 存储页面URL映射
            window.pageUrlMap = pageUrls;
            
            showStatus(`第${currentPageNumber}页，共${totalPageNumber}页`, 'success', 2000);
            
        } catch (error) {
            console.error('[Error] 探测页面信息时出错:', error);
            totalPageNumber = config.maxPageNumber;
            showStatus(`探测页数出错，使用默认: ${totalPageNumber}`, 'error', 3000);
        }
    }

    // 停止定时检查
    function stopAutoCheck() {
        if (checkTimer) {
            clearInterval(checkTimer);
            checkTimer = null;
        }
    }

    // 检查是否滚动到触发加载的位置
    function isNearBottom() {
        // 如果已加载完所有页面，停止检测
        if (allPagesLoaded) {
            return false;
        }
        
        try {
            const scrollHeight = Math.max(
                document.documentElement.scrollHeight,
                document.body.scrollHeight
            );
            const scrollTop = window.pageYOffset ||
                document.documentElement.scrollTop ||
                document.body.scrollTop;
            const clientHeight = window.innerHeight ||
                document.documentElement.clientHeight ||
                document.body.clientHeight;

            // 计算已滚动的百分比
            const scrolledPercent = scrollTop / (scrollHeight - clientHeight);
            // 检查是否已滚动到设定的阈值百分比
            const reachedThreshold = scrolledPercent >= config.scrollThresholdPercent;
            const hasNextPage = getNextPageUrl() !== null;
            // 检查是否已达到最大页数
            const notReachedMaxPage = totalPageNumber === null || currentPageNumber < totalPageNumber;

            return reachedThreshold && hasNextPage && !isLoading && notReachedMaxPage;
        } catch (error) {
            return false;
        }
    }

    // 获取下一页URL
    function getNextPageUrl() {
        // 如果已经加载完所有页面，直接返回null
        if (allPagesLoaded) {
            return null;
        }
        
        const nextPageNumber = currentPageNumber + 1;
        
        // 检查是否超出总页数
        if (totalPageNumber !== null && nextPageNumber > totalPageNumber) {
            return null;
        }
        
        // 优先使用从页面解析的URL
        if (window.pageUrlMap && window.pageUrlMap.has(nextPageNumber)) {
            return window.pageUrlMap.get(nextPageNumber);
        }
        
        // 如果没有找到直接链接，尝试找下一页按钮
        const nextPageLink = findElement(config.nextPageSelectors);
        if (nextPageLink && nextPageLink.href) {
            return nextPageLink.href;
        }
        
        return null;
    }

    // 加载下一页内容
    function loadNextPage() {
        try {
            // 双重检查：如果已经加载完所有页面，立即返回
            if (allPagesLoaded) {
                return;
            }
            
            if (isLoading) {
                return;
            }

            const nextPageUrl = getNextPageUrl();
            if (!nextPageUrl) {
                // 标记所有页面已加载完成
                allPagesLoaded = true;
                stopAutoCheck();
                showStatus('已加载完所有页面', 'success', 3000);
                return;
            }

            // 检查是否已达到最大页数
            if (totalPageNumber !== null && currentPageNumber >= totalPageNumber) {
                // 标记所有页面已加载完成
                allPagesLoaded = true;
                stopAutoCheck();
                showStatus(`已加载完所有 ${totalPageNumber} 页内容`, 'success', 3000);
                return;
            }

            currentPageNumber++;
            isLoading = true;
            showStatus(`正在加载第 ${currentPageNumber} 页...`, 'loading', 0);

            GM_xmlhttpRequest({
                method: 'GET',
                url: nextPageUrl,
                timeout: 30000, // 30秒超时
                onload: function(response) {
                    try {
                        if (response.status === 200) {
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(response.responseText, 'text/html');
                            
                            // 尝试找到内容容器
                            const content = findElement(config.contentSelectors);
                            const newContent = findElementFromDoc(doc, config.contentSelectors);

                            if (content && newContent) {
                                // 为新内容添加标记
                                const pageMarker = document.createElement('div');
                                
                                // 应用配置的样式
                                Object.assign(pageMarker.style, config.separatorStyle);
                                
                                pageMarker.innerHTML = `
                                    <i class="fa fa-chevron-down" style="margin-right: 10px;"></i>
                                    第 ${currentPageNumber} 页
                                    <i class="fa fa-chevron-down" style="margin-left: 10px;"></i>
                                `;
                                
                                // 添加页面分隔符
                                content.appendChild(pageMarker);
                                
                                // 添加新内容（只提取图片内容）
                                const imageElements = newContent.querySelectorAll('p img, img');
                                if (imageElements.length > 0) {
                                    // 为每张图片创建包装元素
                                    imageElements.forEach(img => {
                                        const imgContainer = document.createElement('p');
                                        imgContainer.style.textAlign = 'center';
                                        imgContainer.appendChild(img.cloneNode(true));
                                        content.appendChild(imgContainer);
                                    });
                                } else {
                                    // 如果没有找到图片，就添加所有内容
                                    const contentChildren = Array.from(newContent.children);
                                    contentChildren.forEach(child => {
                                        // 跳过分页导航元素
                                        if (!child.classList.contains('page-link') && 
                                            !child.classList.contains('e3lan') &&
                                            !child.querySelector('.page-link')) {
                                            content.appendChild(child.cloneNode(true));
                                        }
                                    });
                                }
                                
                                showStatus(`第 ${currentPageNumber} 页加载成功`, 'success', 2000);

                                // 加载新添加内容中的图片
                                loadImagesInContent(content);
                                
                            } else {
                                showStatus('无法找到内容容器', 'error', 3000);
                            }
                        } else {
                            showStatus(`加载失败: HTTP ${response.status}`, 'error', 3000);
                        }
                    } catch (parseError) {
                        console.error('[Error] 解析页面内容时出错:', parseError);
                        showStatus('解析页面失败', 'error', 3000);
                    } finally {
                        isLoading = false;

                        // 检查是否已经是最后一页
                        if (currentPageNumber >= totalPageNumber) {
                            allPagesLoaded = true;
                            stopAutoCheck();
                            showStatus(`已加载完所有 ${totalPageNumber} 页内容`, 'success', 3000);
                        } else if (config.continuousLoading && getNextPageUrl() && !allPagesLoaded) {
                            // 使用setTimeout避免可能的递归调用堆栈溢出
                            setTimeout(function() {
                                if (!allPagesLoaded && isNearBottom()) {
                                    loadNextPage();
                                }
                            }, config.loadDelay);
                        }
                    }
                },
                onerror: function(error) {
                    showStatus('网络连接失败', 'error', 3000);
                    isLoading = false;
                    // 失败时回退页数
                    currentPageNumber--;
                },
                ontimeout: function() {
                    showStatus('加载超时，请检查网络', 'error', 3000);
                    isLoading = false;
                    // 超时时回退页数
                    currentPageNumber--;
                }
            });
        } catch (error) {
            showStatus('加载过程出错', 'error', 3000);
            isLoading = false;
            currentPageNumber--;
        }
    }

    // 从解析的文档中查找元素
    function findElementFromDoc(doc, selectors) {
        if (typeof selectors === 'string') {
            return doc.querySelector(selectors);
        }
        
        for (const selector of selectors) {
            const element = doc.querySelector(selector);
            if (element) {
                return element;
            }
        }
        return null;
    }

    // 加载内容中的图片
    function loadImagesInContent(container) {
        try {
            let totalImages = 0;
            
            // 尝试所有可能的图片选择器
            for (const selector of config.imageSelectors) {
                const images = container.querySelectorAll(selector);
                if (images.length > 0) {
                    images.forEach((img, index) => {
                        try {
                            img.loading = 'eager';
                            
                            // 尝试多种数据属性
                            const imageSrc = img.dataset.src || 
                                           img.dataset.original || 
                                           img.getAttribute('data-src') || 
                                           img.getAttribute('data-original');
                            
                            if (imageSrc && !img.src.includes(imageSrc)) {
                                img.src = imageSrc;
                            }
                            
                            // 清理lazy类名和添加loaded标记
                            img.classList.remove('lazy');
                            img.classList.add('loaded');
                            img.style.display = 'block';
                            img.style.opacity = '1';
                            
                            totalImages++;
                        } catch (imgError) {
                            console.error(`[Error] 处理第 ${index + 1} 张图片时出错:`, imgError);
                        }
                    });
                }
            }
            
            if (totalImages > 0) {
                showStatus(`加载了 ${totalImages} 张图片`, 'success', 2000);
            }
        } catch (error) {
            console.error('[Error] 加载图片时出错:', error);
        }
    }

    // 监听滚动事件
    window.addEventListener('scroll', function() {
        // 加强检查：如果已经加载完所有页面，不响应滚动事件
        if (!allPagesLoaded && isNearBottom()) {
            loadNextPage();
        }
    });

    // 初始化函数
    function init() {
        showStatus('自动翻页脚本已启动', 'success', 3000);
        
        // 等待页面完全加载
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                setTimeout(startAutoCheck, 2000);
            });
        } else {
            setTimeout(startAutoCheck, 1000);
        }
        
        // 加载当前页面的图片
        setTimeout(() => {
            const currentContent = findElement(config.contentSelectors);
            if (currentContent) {
                loadImagesInContent(currentContent);
            }
        }, 1500);
    }

    // 启动脚本
    init();
})();