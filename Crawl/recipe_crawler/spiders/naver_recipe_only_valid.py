#-*- coding: utf-8 -*-

import scrapy
import re
import json
import requests
from urlparse import urlparse, parse_qs
from HTMLParser import HTMLParser

visited = {}

class MLStripper(HTMLParser):
    def __init__(self):
        self.reset()
        self.fed = []
    def handle_data(self, d):
        self.fed.append(d)
    def get_data(self):
        return ''.join(self.fed)

# 태그 제거
def strip_tags(html):
    s = MLStripper()
    s.feed(html)
    return s.get_data()

# URL QueryString 파싱
def getQueries(url):
    query = parse_qs(urlparse(url).query)

    for attr, value in query.items():
        query[attr] = query[attr][0];

    return query

# 스파이더
class NaverRecipeSpider(scrapy.Spider):
    # 에이전트
    name = 'naver_recipe_only_valid'
    # 씨앗 URL
    start_urls = ['http://terms.naver.com/list.nhn?cid=48156&categoryId=48156']

    # 맨 처음 실행되는 콜백
    def parse(self, response):
        # 카테고리 목록 추출
        categories = response.css('#content > div.loca_m > div > ul > li > a::attr(href)').extract()

        if (len(categories)):
            # 하위 카테고리가 있을 때
            # 하위 카테고리로 다시 들어간다
            for category in categories:
                # 카테고리 방문 기록 생성
                query = getQueries(category)
                visited[query['categoryId']] = {}

                yield scrapy.Request(response.urljoin(category), self.parse)
        else:
            # 하위 카테고리가 없을 때
            yield scrapy.Request(response.url + '&page=1', self.parsePage)

    # 모든 페이지를 열람하는 콜백
    def parsePage(self, response):

        # 페이징 목록을 가져온다
        # 다른 페이지도 파싱해야 함
        for page in response.xpath('//*[@id="paginate"]/a'):
            # 페이지 풀 URL 생성, 쿼리스트링 파싱
            url = response.urljoin(page.xpath('@href').extract()[0])
            query = getQueries(url)

            yield scrapy.Request(url, self.parsePage)

        # 모든 레시피를 파싱한다
        for recipe in response.css('#content > div.lst_wrap.sub > ul > li > dl > dt > a:nth-child(1)'):
            url = response.urljoin(recipe.xpath('@href').extract()[0])
            yield scrapy.Request(url, self.parseRecipe)

    # 레시피를 파싱하는 콜백
    def parseRecipe(self, response):

        # 서버에 저장할 레코드
        recipe = {}
        query = parse_qs(response.url)

        # 제목
        recipe['title'] = response.xpath('//*[@id="content"]/div[2]/div[1]/h2/text()').extract()
        # 카테고리
        #recipe['category'] = response.xpath('//*[@id="container"]/div[2]/div/div[1]/h3/span//text()').extract()
        recipe['category'] = query['categoryId']

        # 요리재료
        recipe['ingredient'] = response.xpath((
            u"//h4[contains(text(), '요리재료')]"
            u'/following-sibling::h4[1]'
            u"/preceding-sibling::p[preceding-sibling::h4[contains(text(), '요리재료')]]"
        )).extract()

        # 기본정보
        recipe['basic'] = response.xpath((
            u"//h4[contains(text(), '기본정보')]"
            u'/following-sibling::h4[1]'
            u"/preceding-sibling::p[preceding-sibling::h4[contains(text(), '기본정보')]]"
        )).extract()

        # 음식정보
        recipe['food'] = response.xpath(u"//h3[contains(text(), '음식정보')]/following-sibling::p[1]").extract()

        # 태그를 제거한다
        for index, attr in recipe.items():
            if (0 == len(attr)):
                return
            recipe[index] = strip_tags(attr[0]);

        recipe['category'] = int(recipe['category'])
        # 썸네일
        recipe['thumb'] = response.xpath('//*[@id="innerImage0"]/@origin_src').extract()[0]

        # ingredient convert
        recipe['ingredient'] = recipe['ingredient'].replace(u'·', '\n').strip()

        # basic에서 요리시간 추출
        cooktime = re.search(ur"조리시간\s\:\s(\d{0,3})분", recipe['basic'])
        if (cooktime != None):
            recipe['cooktime'] = int(cooktime.groups()[0])

        # basic에서 분량 추출
        amount = re.search(ur"분량\s\:\s(\d{0,3})인분", recipe['basic'])
        if (amount != None):
            recipe['amount'] = int(amount.groups()[0])

        # basic에서 칼로리 추출
        calorie = re.search(ur"칼로리\s\:\s(\d{0,5})kcal", recipe['basic'])
        if (calorie != None):
            recipe['calorie'] = int(calorie.groups()[0])

        # food에서 다이어트 정보 추출
        #if (len(response.xpath(u"/self[contains(text(), '다이어트')]"))):
        #    recipe['isDiet'] = True

        # food에서 보관온도 추출
        temperature = re.search(ur"보관온도\s\:\s([0-9~℃]+)", recipe['food'])
        if (temperature != None):
            recipe['temperature'] = temperature.groups()[0]

        # food에서 보관기간 추출
        expire = re.search(ur"보관기간\s\:\s([0-9~])", recipe['food'])
        if (expire != None):
            recipe['expire'] = int(expire.groups()[0])

        # 문서마다 다음 단계를 의미하는 태그가 다르기에 별도로 처리한다.
        # 문서 끝 xpath 필터
        nextRange = u""

        isThereNext = response.xpath((
            u"//h4[contains(text(), '요리과정')]"
            u'/following-sibling::h4[1]'
        ))

        # 다음 h4태그가 있을 때
        if (len(isThereNext)):
            nextRange = u'/following-sibling::h4[1]'
        else:
            isThereNext = response.xpath((
                u"//h4[contains(text(), '요리과정')]"
                u'/following-sibling::h3[1]'
            ))

            # 다음 h3 태그가 있을 때
            if (len(isThereNext)):
                nextRange = u'/following-sibling::h3[1]'
            else:
                nextRange = u"/following-sibling::div[@class='tmp_source']"

        # 요리과정 텍스트
        recipe['method'] = ''.join([strip_tags(x) for x in response.xpath((
            u"//h4[contains(text(), '요리과정')]"
            + nextRange +
            u"/preceding-sibling::p[preceding-sibling::h4[contains(text(), '요리과정')]]"
        )).extract()])

        recipe['method'] = re.split(r"\d{0,2}\.\s", recipe['method'])

        # 요리과정 이미지
        recipe['methodThumb'] = response.xpath((
            u"//h4[contains(text(), '요리과정')]"
            + nextRange +
            u"/preceding-sibling::div[preceding-sibling::h4[contains(text(), '요리과정')]]/a/img/@origin_src"
        )).extract()

        # 작은 이미지 주소로 변환
        for index, thumbSrc in enumerate(recipe['methodThumb']):
            recipe['methodThumb'][index] = thumbSrc.replace("m4500_4500_fst_n", "w224_fst_n")

        # 원본 주소
        recipe['origin'] = response.url

        # 제목 변경
        recipe['title'] = recipe['title'].replace(u' 만드는 법', '')

        # """
        # # 데이터를 줄이기 위해 불필요한 항목 삭제
        # del recipe['basic']
        # del recipe['food']
        #
        # # API
        # api = 'http://localhost:1337/'
        # api_resource = api + 'resources'
        # api_recipe = api + 'recipes'
        # api_method = api + 'methods'
        #
        # # 이미지 등록
        # thumb = requests.post(api_resource, {
        #     'reference': recipe['thumb']
        # }).json()
        #
        # # 레시피 등록
        # recipe['thumbnail'] = thumb['id']
        #
        # methodThumb = recipe['methodThumb']
        # del recipe['methodThumb']
        #
        # method = recipe['method'];
        # del recipe['method']
        #
        # res = requests.post(api_recipe, recipe).json()
        #
        # # 레시피 조리 과정 등록
        # for thumb in methodThumb:
        #     record = requests.post(api_resource, {
        #         'reference': thumb,
        #         'recipe': res['id']
        #     })
        #
        # for m in method:
        #     record = requests.post(api_method, {
        #         'recipe': res['id'],
        #         'content': m
        #     })
        # """

        yield recipe
